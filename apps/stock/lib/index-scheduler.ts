import { getSql } from "./db";
import { TOTAL_LOOKBACK_HOURS, INDEX_SIZE } from "./stock-constants";
import {
	fetchEtaEntries,
	fetchCacheMap,
	fetchTitleMap,
	fetchSnapshotsByAid,
	type SnapshotRow,
} from "./stock-repository";
import { computeStocks } from "./stock-compute";
import type { Stock } from "./stock-data";

const INTERVAL_MS = 10 * 60 * 1000;

function floorToInterval(ts: number): Date {
	return new Date(Math.floor(ts / INTERVAL_MS) * INTERVAL_MS);
}

function filterSnapshots(
	snapshotsByAid: ReadonlyMap<number, SnapshotRow[]>,
	aids: number[],
	before: Date,
): Map<number, SnapshotRow[]> {
	const out = new Map<number, SnapshotRow[]>();
	for (const aid of aids) {
		const rows = snapshotsByAid.get(aid);
		if (!rows) continue;
		const filtered = rows.filter((r) => r.created_at <= before);
		if (filtered.length > 0) out.set(aid, filtered);
	}
	return out;
}

function marketValue(stocks: Stock[]): number {
	const values = stocks
		.map((s) => s.change)
		.filter((v) => v > 0)
		.sort((a, b) => b - a)
		.slice(0, INDEX_SIZE);
	if (values.length === 0) return 0;
	return values.reduce((sum, v) => sum + v, 0);
}

export async function computeAndRecordIndex(targetTime = Date.now()): Promise<number> {
	const sql = getSql();
	const now = floorToInterval(targetTime);
	const prevTime = floorToInterval(targetTime - INTERVAL_MS);

	console.log(`[index-scheduler] run for ${now.toISOString()}`);

	const exists = await sql`
		SELECT 1 FROM internal.composite_index WHERE time = ${now} LIMIT 1
	`;
	if (exists.length > 0) {
		console.log(`[index-scheduler] skip — already recorded at ${now.toISOString()}`);
		return 0;
	}

	console.time("[index-scheduler] eta");
	const etaEntries = await fetchEtaEntries(sql);
	console.timeEnd("[index-scheduler] eta");
	console.log(`[index-scheduler] eta rows=${etaEntries.length}`);

	if (etaEntries.length === 0) return 0;

	const aids = etaEntries.map((e) => e.aid);
	const lookback = new Date(now.getTime() - TOTAL_LOOKBACK_HOURS * 3600 * 1000);
	const lookbackPrev = new Date(prevTime.getTime() - TOTAL_LOOKBACK_HOURS * 3600 * 1000);

	console.time("[index-scheduler] fetch data");
	const [cacheMap, titleMap, snapshotsByAid] = await Promise.all([
		fetchCacheMap(sql, aids, lookback),
		fetchTitleMap(sql, aids),
		fetchSnapshotsByAid(sql, aids, lookback),
	]);
	console.timeEnd("[index-scheduler] fetch data");

	console.time("[index-scheduler] compute stocks (now)");
	const { stocks } = computeStocks(etaEntries, titleMap, cacheMap, snapshotsByAid, now, true);
	stocks.sort((a, b) => b.change - a.change);
	const top100 = stocks.slice(0, INDEX_SIZE);
	const top100Aids = top100.map((s) => Number(s.id));
	console.timeEnd("[index-scheduler] compute stocks (now)");
	console.log(`[index-scheduler] computed ${stocks.length} stocks, top100=${top100Aids.length}`);

	if (top100Aids.length === 0) return 0;

	const v0 = marketValue(top100);
	console.log(`[index-scheduler] v0=${v0.toFixed(2)}`);

	console.time("[index-scheduler] compute prev");
	const prevEta = etaEntries.filter((e) => top100Aids.includes(e.aid));
	const prevSnapshots = filterSnapshots(snapshotsByAid, top100Aids, prevTime);

	const cacheMapPrev =
		now.getTime() === prevTime.getTime()
			? cacheMap
			: await fetchCacheMap(sql, top100Aids, lookbackPrev);

	const { stocks: prevStocks } = computeStocks(
		prevEta,
		titleMap,
		cacheMapPrev,
		prevSnapshots,
		prevTime,
		false,
	);
	console.timeEnd("[index-scheduler] compute prev");

	const v1 = marketValue(prevStocks);
	console.log(`[index-scheduler] v1=${v1.toFixed(2)}`);

	console.time("[index-scheduler] fetch last value");
	const [lastRow] = (await sql`
		SELECT value FROM internal.composite_index
		ORDER BY time DESC LIMIT 1
	`) as { value: number }[];
	console.timeEnd("[index-scheduler] fetch last value");

	const v2 = lastRow?.value ?? 1000;
	console.log(`[index-scheduler] v2=${v2.toFixed(2)}`);

	const newValue = v1 > 0 ? (v2 * v0) / v1 : v2;
	console.log(`[index-scheduler] result = ${v2.toFixed(2)} × ${v0.toFixed(2)} / ${v1.toFixed(2)} = ${newValue.toFixed(2)}`);

	await sql`
		INSERT INTO internal.composite_index (time, value)
		VALUES (${now}, ${newValue})
		ON CONFLICT (time) DO NOTHING
	`;

	return newValue;
}

const JOB_INTERVAL_MS = 1 * 60 * 1000;

export function startIndexScheduler(): void {
	const run = async () => {
		try {
			const value = await computeAndRecordIndex();
			if (value > 0) {
				console.log(`[index-scheduler] recorded index=${value.toFixed(2)}`);
			}
		} catch (err) {
			console.error("[index-scheduler] failed:", err);
		}
	};

	run();
	setInterval(run, JOB_INTERVAL_MS);
	console.log(`[index-scheduler] started, interval=${JOB_INTERVAL_MS / 1000}s`);
}
