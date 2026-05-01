import type { SnapshotRow } from "./stock-repository";
import type { EtaRow, NewCacheEntry } from "./stock-repository";
import type { Stock, MarketIndex } from "./stock-data";
import {
	WINDOW_COUNT,
	STEP_HOURS,
	WINDOW_HOURS,
	INDEX_SIZE,
	INDEX_FACTOR,
} from "./stock-constants";

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

/** True when every one of the WINDOW_COUNT windows for this AID has a cache entry. */
export function isFullyCached(
	aid: number,
	cacheMap: Map<string, number>,
	now: Date,
	windowCount = WINDOW_COUNT
): boolean {
	for (let i = 0; i < windowCount; i++) {
		const endTime = new Date(now.getTime() - i * STEP_HOURS * 3600 * 1000);
		const key = `${aid}_${endTime.toISOString()}`;
		if (!cacheMap.has(key)) return false;
	}
	return true;
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
	windowCount = WINDOW_COUNT
): SingleStockResult | null {
	const newCacheEntries: NewCacheEntry[] = [];
	const increments = new Array<number>(windowCount).fill(0);

	for (let i = 0; i < windowCount; i++) {
		const endTime = new Date(now.getTime() - i * STEP_HOURS * 3600 * 1000);
		const startTime = new Date(endTime.getTime() - WINDOW_HOURS * 3600 * 1000);

		const cacheKey = `${aid}_${endTime.toISOString()}`;
		const cached = cacheMap.get(cacheKey);

		if (cached !== undefined) {
			if (cached >= 0) increments[i] = cached;
			continue;
		}

		let computed = false;
		const snapStart = findNearest(snapshots, startTime);
		const snapEnd = findNearest(snapshots, endTime);

		if (snapStart && snapEnd && snapStart.id !== snapEnd.id) {
			const viewsDiff = snapEnd.views - snapStart.views;
			const hoursDiff =
				(snapEnd.created_at.getTime() - snapStart.created_at.getTime()) / 3600000;

			if (hoursDiff > 0) {
				const increment = Math.round((viewsDiff / hoursDiff) * WINDOW_HOURS);
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

	if (!increments.some((v) => v > 0)) return null;

	const change = increments[0];
	let oldest = 0;
	for (let i = windowCount - 1; i >= 0; i--) {
		if (increments[i] > 0) {
			oldest = increments[i];
			break;
		}
	}
	const changePercent = oldest !== 0 ? ((change - oldest) / oldest) * 100 : 0;

	return {
		stock: {
			id: aid.toString(),
			name,
			symbol,
			price: change,
			change,
			changePercent: Number.isNaN(changePercent) ? 0 : changePercent,
			sparkline: increments.slice().reverse(),
		},
		newCacheEntries,
	};
}

export function computeStocks(
	etaEntries: EtaRow[],
	titleMap: Map<number, { title: string; bvid: string | null }>,
	cacheMap: ReadonlyMap<string, number>,
	snapshotsByAid: ReadonlyMap<number, SnapshotRow[]>,
	now: Date
): { stocks: Stock[]; newCacheEntries: NewCacheEntry[] } {
	const newCacheEntries: NewCacheEntry[] = [];
	const stocks: Stock[] = [];

	for (const entry of etaEntries) {
		const aid = entry.aid;
		const meta = titleMap.get(aid);
		const name = meta?.title ?? `AV${aid}`;
		const symbol = meta?.bvid ?? `AV${aid}`;
		const snapshots = snapshotsByAid.get(aid) ?? [];

		const result = computeSingleStock(aid, name, symbol, cacheMap, snapshots, now);
		if (!result) continue;

		stocks.push(result.stock);
		newCacheEntries.push(...result.newCacheEntries);
	}

	return { stocks, newCacheEntries };
}

/** Build the market index from the top stocks. */
export function computeMarketIndex(stocks: Stock[], now: Date): MarketIndex {
	const marketHistory = new Array<number>(WINDOW_COUNT).fill(0);

	for (let w = 0; w < WINDOW_COUNT; w++) {
		const top = stocks
			.map((s) => s.sparkline[w] ?? 0)
			.filter((v) => v > 0)
			.sort((a, b) => b - a)
			.slice(0, INDEX_SIZE);

		marketHistory[w] = top.reduce((sum, v) => sum + v, 0) / INDEX_FACTOR;
	}

	const lastValue = marketHistory[marketHistory.length - 1] ?? 0;
	const firstValue = marketHistory[0] ?? 0;
	const marketChange = lastValue - firstValue;
	const marketChangePercent =
		firstValue !== 0 ? Number(((marketChange / firstValue) * 100).toFixed(2)) : 0;

	return {
		name: "中V指数",
		value: lastValue,
		change: marketChange,
		changePercent: marketChangePercent,
		history: marketHistory,
		baseTime: now.toISOString(),
	};
}
