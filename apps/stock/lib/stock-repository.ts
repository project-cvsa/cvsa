import type { Sql } from "postgres";
import { withCache, perAidMget, perAidMset } from "./cache";
import type { MarketIndex } from "./stock-data";

export interface EtaRow {
	aid: number;
	eta: number;
	speed: number;
	current_views: number;
	updated_at: Date;
}

export interface SnapshotRow {
	id: number;
	created_at: Date;
	views: number;
	aid: number;
}

export interface NewCacheEntry {
	aid: number;
	end_time: Date;
	views_increment: number;
}

/** Search matching AIDs by BVID, AID, or song name. */
export async function searchAids(sql: Sql, query: string, limit = 30): Promise<number[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const key = `search:${trimmed}`;
	return withCache(key, 60, async () => {
		const aids = new Set<number>();

		if (/^BV/i.test(trimmed)) {
			const raw = (await sql`
				SELECT aid::bigint FROM public.bilibili_metadata
				WHERE bvid = ${trimmed}
				LIMIT 1
			`) as Record<string, unknown>[];
			for (const r of raw) aids.add(Number(r.aid));
		} else if (/^\d+$/.test(trimmed)) {
			const raw = (await sql`
				SELECT aid::bigint FROM public.eta
				WHERE aid = ${Number(trimmed)}
				LIMIT 1
			`) as Record<string, unknown>[];
			for (const r of raw) aids.add(Number(r.aid));
		}

		if (aids.size < limit) {
			const remaining = limit - aids.size;
			const excludeList = aids.size > 0 ? [...aids] : [0];
			const raw = (await sql`
				SELECT s.aid::bigint
				FROM public.songs s
				JOIN public.eta e ON s.aid = e.aid
				WHERE s.name ILIKE ${`%${trimmed}%`}
				  AND s.aid != ALL(${excludeList})
				ORDER BY e.speed DESC
				LIMIT ${remaining}
			`) as Record<string, unknown>[];
			for (const r of raw) aids.add(Number(r.aid));
		}

		return [...aids];
	});
}

/** Fetch ETA rows for specific AIDs. */
export async function fetchEtaEntriesByAids(sql: Sql, aids: number[]): Promise<EtaRow[]> {
	if (aids.length === 0) return [];

	const sorted = [...aids].sort((a, b) => a - b).join(",");
	return withCache(`eta:aids:${sorted}`, 60, async () => {
		const raw = (await sql`
			SELECT e.aid::bigint, e.eta::real, e.speed::real,
			       e.current_views::integer, e.updated_at
			FROM public.eta e
			WHERE e.aid = ANY(${aids})
			ORDER BY e.speed DESC
		`) as Record<string, unknown>[];

		return raw.map((r) => ({
			aid: Number(r.aid),
			eta: Number(r.eta),
			speed: Number(r.speed),
			current_views: Number(r.current_views),
			updated_at: r.updated_at as Date,
		}));
	});
}

/** Single ETA row for a specific AID. Returns null if not found. */
export async function fetchEtaEntry(sql: Sql, aid: number): Promise<EtaRow | null> {
	return withCache(`eta:${aid}`, 180, async () => {
		const raw = (await sql`
			SELECT e.aid::bigint, e.eta::real, e.speed::real,
			       e.current_views::integer, e.updated_at
			FROM public.eta e
			WHERE e.aid = ${aid}
			LIMIT 1
		`) as Record<string, unknown>[];

		if (raw.length === 0) return null;
		const r = raw[0];
		return {
			aid: Number(r.aid),
			eta: Number(r.eta),
			speed: Number(r.speed),
			current_views: Number(r.current_views),
			updated_at: r.updated_at as Date,
		};
	});
}

/** Top-500 videos by speed, not blacklisted, active within last 3 days. */
export async function fetchEtaEntries(sql: Sql): Promise<EtaRow[]> {
	return withCache("eta:top500", 180, async () => {
		const raw = (await sql`
			SELECT e.aid::bigint, e.eta::real, e.speed::real,
			       e.current_views::integer, e.updated_at
			FROM public.eta e
			LEFT JOIN public.video_blacklist vb ON e.aid = vb.aid
			WHERE e.updated_at > NOW() - INTERVAL '3 days'
			  AND vb.aid IS NULL
			ORDER BY e.speed DESC
			LIMIT 500
		`) as Record<string, unknown>[];

		return raw.map((r) => ({
			aid: Number(r.aid),
			eta: Number(r.eta),
			speed: Number(r.speed),
			current_views: Number(r.current_views),
			updated_at: r.updated_at as Date,
		}));
	});
}

/** Pre-computed window increments keyed by `aid_endTime`. Per-aid Redis cache. */
export async function fetchCacheMap(
	sql: Sql,
	aids: number[],
	lookback: Date
): Promise<Map<string, number>> {
	const { hits, misses } = await perAidMget<{ end_time: string; views_increment: number }[]>(
		"incr",
		aids,
		(raw) => JSON.parse(raw) as { end_time: string; views_increment: number }[]
	);

	const out = new Map<string, number>();
	for (const [aid, entries] of hits) {
		for (const e of entries) {
			if (new Date(e.end_time) >= lookback) {
				out.set(`${aid}_${e.end_time}`, e.views_increment);
			}
		}
	}

	if (misses.length > 0) {
		const raw = (await sql`
			SELECT aid::bigint, end_time, views_increment::integer
			FROM internal.increment_cache_day
			WHERE aid = ANY(${misses})
			  AND end_time >= ${lookback}
		`) as Record<string, unknown>[];

		const byAid = new Map<number, { end_time: string; views_increment: number }[]>();
		for (const r of raw) {
			const aid = Number(r.aid);
			const e = {
				end_time: (r.end_time as Date).toISOString(),
				views_increment: Number(r.views_increment),
			};
			const arr = byAid.get(aid);
			if (arr) arr.push(e);
			else byAid.set(aid, [e]);
			out.set(`${aid}_${e.end_time}`, e.views_increment);
		}

		const toSet = new Map<number, unknown>();
		for (const miss of misses) {
			toSet.set(miss, byAid.get(miss) ?? []);
		}
		await perAidMset("incr", 60, toSet);
	}

	return out;
}

/** Title and BVid lookup for the given AIDs. Per-aid Redis cache. */
export async function fetchTitleMap(
	sql: Sql,
	aids: number[]
): Promise<Map<number, { title: string; bvid: string | null }>> {
	const { hits, misses } = await perAidMget<{ title: string; bvid: string | null }>(
		"title",
		aids,
		(raw) => JSON.parse(raw) as { title: string; bvid: string | null }
	);

	const out = new Map<number, { title: string; bvid: string | null }>();
	for (const [aid, val] of hits) {
		out.set(aid, val);
	}

	if (misses.length > 0) {
		const raw = (await sql`
			SELECT bm.aid::bigint, COALESCE(s.name, bm.title) AS title, bm.bvid
			FROM public.bilibili_metadata bm
			LEFT JOIN public.songs s ON bm.aid = s.aid
			WHERE bm.aid = ANY(${misses})
		`) as Record<string, unknown>[];

		const byAid = new Map<number, unknown>();
		for (const miss of misses) {
			byAid.set(miss, { title: `AV${miss}`, bvid: null });
		}
		for (const r of raw) {
			const aid = Number(r.aid);
			const val = {
				title: (r.title as string) ?? `AV${aid}`,
				bvid: (r.bvid as string) ?? null,
			};
			out.set(aid, val);
			byAid.set(aid, val);
		}

		await perAidMset("title", 1200, byAid);
	}

	return out;
}

/** Raw snapshots for uncached AIDs, grouped by AID. Per-aid Redis cache. */
export async function fetchSnapshotsByAid(
	sql: Sql,
	aids: number[],
	lookback: Date
): Promise<Map<number, SnapshotRow[]>> {
	if (aids.length === 0) return new Map();

	const { hits, misses } = await perAidMget<
		{ id: number; created_at: string; views: number; aid: number }[]
	>(
		"snap",
		aids,
		(raw) => JSON.parse(raw) as { id: number; created_at: string; views: number; aid: number }[]
	);

	const out = new Map<number, SnapshotRow[]>();
	for (const [aid, rows] of hits) {
		const filtered = rows
			.filter((r) => new Date(r.created_at) >= lookback)
			.map(
				(r): SnapshotRow => ({
					id: r.id,
					created_at: new Date(r.created_at),
					views: r.views,
					aid: r.aid,
				})
			);
		if (filtered.length > 0) out.set(aid, filtered);
	}

	if (misses.length > 0) {
		const raw = (await sql`
			SELECT id::integer, created_at, views::integer, aid::bigint
			FROM public.video_snapshot
			WHERE aid = ANY(${misses})
			  AND created_at >= ${lookback}
			ORDER BY aid, created_at
		`) as Record<string, unknown>[];

		const byAid = new Map<
			number,
			{ id: number; created_at: string; views: number; aid: number }[]
		>();
		for (const r of raw) {
			const entry = {
				id: Number(r.id),
				created_at: (r.created_at as Date).toISOString(),
				views: Number(r.views),
				aid: Number(r.aid),
			};
			const arr = byAid.get(entry.aid);
			if (arr) arr.push(entry);
			else byAid.set(entry.aid, [entry]);

			const existing = out.get(entry.aid);
			if (existing) {
				existing.push({
					id: entry.id,
					created_at: new Date(entry.created_at),
					views: entry.views,
					aid: entry.aid,
				});
			} else {
				out.set(entry.aid, [
					{
						id: entry.id,
						created_at: new Date(entry.created_at),
						views: entry.views,
						aid: entry.aid,
					},
				]);
			}
		}

		const toSet = new Map<number, unknown>();
		for (const miss of misses) {
			toSet.set(miss, byAid.get(miss) ?? []);
		}
		await perAidMset("snap", 30, toSet);
	}

	return out;
}

/** Batch-insert newly computed cache entries that aren't already persisted. */
export async function insertCacheEntries(
	sql: Sql,
	entries: NewCacheEntry[],
	existingKeys: Set<string>
): Promise<number> {
	const trulyNew = entries.filter(
		(e) => !existingKeys.has(`${e.aid}_${e.end_time.toISOString()}`)
	);
	if (trulyNew.length === 0) return 0;

	const values = trulyNew.map(
		(e) => `(${e.aid}, '${e.end_time.toISOString()}', ${e.views_increment})`
	);

	const chunkSize = 1000;
	for (let i = 0; i < values.length; i += chunkSize) {
		const chunk = values.slice(i, i + chunkSize);
		await sql.unsafe(
			`INSERT INTO internal.increment_cache_day (aid, end_time, views_increment) VALUES ${chunk.join(", ")}`
		);
	}

	return trulyNew.length;
}

export async function fetchCompositeIndex(
	sql: Sql,
	rangeMs?: number,
	stepMs = 30 * 60 * 1000,
): Promise<MarketIndex> {
	const effectiveRange = rangeMs ?? 7 * 24 * 3600 * 1000;
	const lookback = new Date(Date.now() - effectiveRange - stepMs);

	const rows = (await sql`
		SELECT time, value
		FROM internal.composite_index
		WHERE time >= ${lookback}
		ORDER BY time ASC
	`) as { time: Date; value: number }[];

	if (rows.length === 0) {
		return {
			name: "中V指数",
			value: 0,
			change: 0,
			changePercent: 0,
			history: [],
			baseTime: "",
		};
	}

	const pointCount = Math.ceil(effectiveRange / stepMs);
	const latestRowTime = rows[rows.length - 1].time.getTime();
	const now = new Date(Math.floor(latestRowTime / stepMs) * stepMs);
	const history: number[] = [];

	for (let i = pointCount; i >= 0; i--) {
		const target = new Date(now.getTime() - i * stepMs);
		let nearest = rows[0].value;
		let minDiff = Math.abs(rows[0].time.getTime() - target.getTime());
		for (let j = 1; j < rows.length; j++) {
			const diff = Math.abs(rows[j].time.getTime() - target.getTime());
			if (diff < minDiff) {
				minDiff = diff;
				nearest = rows[j].value;
			}
		}
		history.push(nearest);
	}

	// Monday 08:00 CST = Monday 00:00 UTC
	const mondayUtc = new Date(now);
	const dow = mondayUtc.getUTCDay();
	mondayUtc.setUTCDate(mondayUtc.getUTCDate() - (dow === 0 ? 6 : dow - 1));
	mondayUtc.setUTCHours(0, 0, 0, 0);

	let openValue = history[history.length - 1];
	let minOpenDiff = Infinity;
	for (let i = 0; i < history.length; i++) {
		const t = new Date(now.getTime() - (pointCount - i) * stepMs);
		const diff = Math.abs(t.getTime() - mondayUtc.getTime());
		if (diff < minOpenDiff) {
			minOpenDiff = diff;
			openValue = history[i];
		}
	}

	const positives = history.filter((v) => v > 0);
	const latest = rows[rows.length - 1].value;
	const firstOfRange = positives.length > 0 ? positives[0] : latest;
	const change = latest - firstOfRange;
	const changePercent = firstOfRange !== 0 ? (change / firstOfRange) * 100 : 0;

	return {
		name: "中V指数",
		value: latest,
		change: Number(change.toFixed(2)),
		changePercent: Number(changePercent.toFixed(2)),
		history,
		baseTime: now.toISOString(),
		pointIntervalMs: stepMs,
		openValue,
		highValue: positives.length > 0 ? Math.max(...positives) : 0,
		lowValue: positives.length > 0 ? Math.min(...positives) : 0,
	};
}
