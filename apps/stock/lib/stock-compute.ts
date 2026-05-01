import { fetchEtaEntries, fetchSnapshotsByAid, type SnapshotRow } from "./stock-repository";
import type { EtaRow, NewCacheEntry } from "./stock-repository";
import type { Stock } from "./stock-data";
import { WINDOW_COUNT, STEP_HOURS, WINDOW_HOURS, INDEX_FACTOR } from "./stock-constants";
import { getSql } from "./db";

/** Find the snapshot closest in time to `target`. Linear scan (snapshots are already ordered by `aid` but may be sparse). */
export function findNearest(snapshots: SnapshotRow[], target: Date): SnapshotRow | null {
	if (snapshots.length === 0) return null;

	let nearest = snapshots[0];
	let minDiff = Math.abs(nearest.created_at.getTime() - target.getTime());

	for (let i = 1; i < snapshots.length; i++) {
		const diff = Math.abs(snapshots[i].created_at.getTime() - target.getTime());
		if (diff < minDiff) {
			minDiff = diff;
			nearest = snapshots[i];
		}
	}

	return nearest;
}

export function isFullyCached(
	aid: number,
	cacheMap: Map<string, number>,
	now: Date,
	windowCount = WINDOW_COUNT
): boolean {
	const windowMs = WINDOW_HOURS * 3600 * 1000;
	let hasOldValid = false;

	for (let i = 0; i < windowCount; i++) {
		const endTime = new Date(now.getTime() - i * STEP_HOURS * 3600 * 1000);
		const key = `${aid}_${endTime.toISOString()}`;
		const cached = cacheMap.get(key);

		if (cached === undefined) return false;

		if (cached >= 0 && now.getTime() - endTime.getTime() >= windowMs) {
			hasOldValid = true;
		}
	}

	// If no window ≥ 24h old has a real (non-sentinel) value,
	// the video is either newborn or has no usable history. Bypass cache.
	return hasOldValid;
}

export interface SingleStockResult {
	stock: Stock;
	newCacheEntries: NewCacheEntry[];
}

export function computeSingleStock(
	aid: number,
	name: string,
	symbol: string,
	cacheMap: ReadonlyMap<string, number>,
	snapshots: SnapshotRow[],
	now: Date,
	forceFreshPrice = false,
	windowCount = WINDOW_COUNT
): SingleStockResult | null {
	const newCacheEntries: NewCacheEntry[] = [];
	const increments = new Array<number>(windowCount).fill(0);

	const windowMs = WINDOW_HOURS * 3600 * 1000;
	const birthTime: Date | null = snapshots.length > 0 ? snapshots[0].created_at : null;
	const isNewborn = birthTime !== null && now.getTime() - birthTime.getTime() < windowMs;

	for (let i = 0; i < windowCount; i++) {
		const endTime = new Date(now.getTime() - i * STEP_HOURS * 3600 * 1000);

		const cacheKey = `${aid}_${endTime.toISOString()}`;
		const cached = cacheMap.get(cacheKey);

		if (cached !== undefined && !isNewborn) {
			if (cached >= 0) increments[i] = cached;
			continue;
		}

		let computed = false;
		const startTime = new Date(endTime.getTime() - WINDOW_HOURS * 3600 * 1000);
		const snapStart = findNearest(snapshots, startTime);
		const snapEnd = findNearest(snapshots, endTime);

		if (snapStart && snapEnd && snapStart.id !== snapEnd.id) {
			const viewsDiff = snapEnd.views - snapStart.views;
			const hoursDiff =
				(snapEnd.created_at.getTime() - snapStart.created_at.getTime()) / 3600000;

			if (hoursDiff > 0) {
				const increment = isNewborn
					? Math.round(viewsDiff)
					: Math.round((viewsDiff / hoursDiff) * WINDOW_HOURS);
				increments[i] = increment;
				newCacheEntries.push({
					aid,
					end_time: endTime,
					views_increment: increment,
				});
				computed = true;
			}
		}

		if (!computed) {
			newCacheEntries.push({
				aid,
				end_time: endTime,
				views_increment: -1,
			});
		}
	}

	// Trim trailing non-positive windows (oldest windows beyond available snapshot data)
	let tail = increments.length;
	while (tail > 0 && increments[tail - 1] <= 0) tail--;
	if (tail === 0) return null;
	if (tail < increments.length) {
		increments.length = tail;
	}

	let price: number;
	if (forceFreshPrice) {
		const liveEnd = now;
		const liveStart = new Date(now.getTime() - WINDOW_HOURS * 3600 * 1000);
		const snapStart = findNearest(snapshots, liveStart);
		const snapEnd = findNearest(snapshots, liveEnd);

		if (snapStart && snapEnd && snapStart.id !== snapEnd.id) {
			const viewsDiff = snapEnd.views - snapStart.views;
			const hoursDiff =
				(snapEnd.created_at.getTime() - snapStart.created_at.getTime()) / 3600000;

			if (hoursDiff > 0) {
				price = isNewborn ? Math.round(viewsDiff) : (viewsDiff / hoursDiff) * WINDOW_HOURS;
			} else {
				price = increments[0];
			}
		} else {
			price = increments[0];
		}
	} else {
		price = increments[0];
	}

	const oldest = increments[increments.length - 1];
	const change = price - oldest;
	const changePercent = oldest !== 0 ? ((price - oldest) / oldest) * 100 : 0;

	return {
		stock: {
			id: aid.toString(),
			name,
			symbol,
			price,
			change,
			changePercent: Number.isNaN(changePercent) ? 0 : changePercent,
			sparkline: increments.reverse(),
		},
		newCacheEntries,
	};
}

export function computeStocks(
	etaEntries: EtaRow[],
	titleMap: Map<number, { title: string; bvid: string | null }>,
	cacheMap: ReadonlyMap<string, number>,
	snapshotsByAid: ReadonlyMap<number, SnapshotRow[]>,
	now: Date,
	forceFreshPrice = false
): { stocks: Stock[]; newCacheEntries: NewCacheEntry[] } {
	const newCacheEntries: NewCacheEntry[] = [];
	const stocks: Stock[] = [];

	for (const entry of etaEntries) {
		const aid = entry.aid;
		const meta = titleMap.get(aid);
		const name = meta?.title ?? `AV${aid}`;
		const symbol = meta?.bvid ?? `AV${aid}`;
		const snapshots = snapshotsByAid.get(aid) ?? [];

		const result = computeSingleStock(
			aid,
			name,
			symbol,
			cacheMap,
			snapshots,
			now,
			forceFreshPrice
		);
		if (!result) continue;

		stocks.push(result.stock);
		newCacheEntries.push(...result.newCacheEntries);
	}

	return { stocks, newCacheEntries };
}

/** Build the market index from the top stocks. */
export async function computeMarketIndex(time: Date): Promise<number> {
	const startTime = new Date(time.getTime() - WINDOW_HOURS * 3600 * 1000);
	const sql = getSql();

	const rows = (await sql`
		SELECT value FROM internal.composite_index
		WHERE time = ${time}
		LIMIT 1
	`) as { value: number }[];
	if (rows.length > 0) {
		console.log(`[computeMarketIndex] found index at ${time.toISOString()}`);
		return rows[0].value;
	}

	console.time("[index-scheduler] eta");
	const etaEntries = await fetchEtaEntries(sql);
	console.timeEnd("[index-scheduler] eta");
	console.log(`[index-scheduler] eta rows=${etaEntries.length}`);

	if (etaEntries.length === 0) return 0;

	const aids = etaEntries.map((e) => e.aid);
	const snapshots = await fetchSnapshotsByAid(
		sql,
		aids,
		new Date(time.getTime() - 8 * 86400 * 1000)
	);
	const values = [];
	for (const aid of aids) {
		const snapshotsForAid = snapshots.get(aid);
		if (!snapshotsForAid) {
			console.warn(`cannot get snapshots for aid=${aid}`);
			continue;
		}
		const startSnapshot = findNearest(snapshotsForAid, startTime);
		const endSnapshot = findNearest(snapshotsForAid, time);
		if (!startSnapshot) {
			console.warn(`cannot find snapshot for aid=${aid}, time=${startTime.toISOString()}`);
			continue;
		}
		if (!endSnapshot) {
			console.warn(`cannot find snapshot for aid=${aid}, time=${startTime.toISOString()}`);
			continue;
		}
		const viewsDiff = endSnapshot.views - startSnapshot.views;
		const hoursDiff =
			(endSnapshot.created_at.getTime() - startSnapshot.created_at.getTime()) / 3600 / 1000;
		if (hoursDiff > 0) {
			const value = (viewsDiff / hoursDiff) * WINDOW_HOURS;
			values.push(value);
		}
	}
	return (
		values
			.sort((a, b) => b - a)
			.slice(0, 100)
			.reduce((sum, v) => sum + v, 0) / INDEX_FACTOR
	);
}
