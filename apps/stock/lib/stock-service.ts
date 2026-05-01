import { getSql } from "./db";
import type { Stock, MarketIndex } from "./stock-data";
import { snapToGrid, TOTAL_LOOKBACK_HOURS } from "./stock-constants";
import {
	fetchEtaEntries,
	fetchCacheMap,
	fetchTitleMap,
	fetchSnapshotsByAid,
	insertCacheEntries,
	fetchCompositeIndex,
} from "./stock-repository";
import { computeStocks } from "./stock-compute";

export async function getStocks(): Promise<Stock[]> {
	console.time("getStocks: total");

	const sql = getSql();
	const now = snapToGrid(Date.now());

	console.time("getStocks: eta query");
	const etaEntries = await fetchEtaEntries(sql);
	console.timeEnd("getStocks: eta query");
	console.log(`getStocks: eta returned ${etaEntries.length} rows`);

	if (etaEntries.length === 0) {
		console.timeEnd("getStocks: total");
		return [];
	}

	const aids = etaEntries.map((e) => e.aid);
	const lookback = new Date(now.getTime() - TOTAL_LOOKBACK_HOURS * 3600 * 1000);

	console.time("getStocks: cache query");
	const cacheMap = await fetchCacheMap(sql, aids, lookback);
	console.timeEnd("getStocks: cache query");

	console.time("getStocks: title query");
	const titleMap = await fetchTitleMap(sql, aids);
	console.timeEnd("getStocks: title query");

	const existingCacheKeys = new Set(cacheMap.keys());

	console.time("getStocks: snapshot query");
	const snapshotsByAid = await fetchSnapshotsByAid(sql, aids, lookback);
	console.timeEnd("getStocks: snapshot query");

	console.time("getStocks: window computation");
	const { stocks, newCacheEntries } = computeStocks(
		etaEntries,
		titleMap,
		cacheMap,
		snapshotsByAid,
		now,
		true,
	);
	console.timeEnd("getStocks: window computation");

	const realEntries = newCacheEntries.filter((e) => e.views_increment >= 0).length;
	const sentinelEntries = newCacheEntries.filter((e) => e.views_increment === -1).length;
	console.log(
		`getStocks: computed ${stocks.length} stocks, ${realEntries} new + ${sentinelEntries} sentinel cache entries`,
	);

	console.time("getStocks: cache insert");
	const inserted = await insertCacheEntries(sql, newCacheEntries, existingCacheKeys);
	console.timeEnd("getStocks: cache insert");
	console.log(`getStocks: inserted ${inserted} truly new entries`);

	stocks.sort((a, b) => b.price - a.price);

	console.timeEnd("getStocks: total");
	return stocks.slice(0, 100);
}

const INDEX_RANGES: Record<string, { days: number; stepMs: number }> = {
	day: { days: 1, stepMs: 10 * 60 * 1000 },
	week: { days: 7, stepMs: 60 * 60 * 1000 },
	"2week": { days: 14, stepMs: 2 * 3600 * 1000 },
	month: { days: 30, stepMs: 4 * 3600 * 1000 },
	quarter: { days: 90, stepMs: 12 * 3600 * 1000 },
};

export async function getIndex(range = "week"): Promise<MarketIndex> {
	const r = INDEX_RANGES[range] ?? INDEX_RANGES.week;
	const sql = getSql();
	return fetchCompositeIndex(sql, r.days * 24 * 3600 * 1000, r.stepMs);
}
