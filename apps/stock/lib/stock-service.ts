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

export async function getTopStocks(): Promise<{
	stocks: Stock[];
	marketIndex: MarketIndex;
}> {
	console.time("getTopStocks: total");

	const sql = getSql();
	const now = snapToGrid(Date.now());

	console.time("getTopStocks: eta query");
	const etaEntries = await fetchEtaEntries(sql);
	console.timeEnd("getTopStocks: eta query");
	console.log(`getTopStocks: eta returned ${etaEntries.length} rows`);

	if (etaEntries.length === 0) {
		const marketIndex = await fetchCompositeIndex(sql);
		console.timeEnd("getTopStocks: total");
		return {
			stocks: [],
			marketIndex,
		};
	}

	const aids = etaEntries.map((e) => e.aid);
	const lookback = new Date(now.getTime() - TOTAL_LOOKBACK_HOURS * 3600 * 1000);

	console.time("getTopStocks: cache query");
	const cacheMap = await fetchCacheMap(sql, aids, lookback);
	console.timeEnd("getTopStocks: cache query");

	console.time("getTopStocks: title query");
	const titleMap = await fetchTitleMap(sql, aids);
	console.timeEnd("getTopStocks: title query");

	const existingCacheKeys = new Set(cacheMap.keys());

	console.time("getTopStocks: snapshot query");
	const snapshotsByAid = await fetchSnapshotsByAid(sql, aids, lookback);
	console.timeEnd("getTopStocks: snapshot query");

	console.time("getTopStocks: window computation");
	const { stocks, newCacheEntries } = computeStocks(
		etaEntries,
		titleMap,
		cacheMap,
		snapshotsByAid,
		now,
		true
	);
	console.timeEnd("getTopStocks: window computation");

	const realEntries = newCacheEntries.filter((e) => e.views_increment >= 0).length;
	const sentinelEntries = newCacheEntries.filter((e) => e.views_increment === -1).length;
	console.log(
		`getTopStocks: computed ${stocks.length} stocks, ${realEntries} new + ${sentinelEntries} sentinel cache entries`
	);

	console.time("getTopStocks: cache insert");
	const inserted = await insertCacheEntries(sql, newCacheEntries, existingCacheKeys);
	console.timeEnd("getTopStocks: cache insert");
	console.log(`getTopStocks: inserted ${inserted} truly new entries`);

	stocks.sort((a, b) => b.price - a.price);

	const marketIndex = await fetchCompositeIndex(sql);

	console.timeEnd("getTopStocks: total");
	return { stocks: stocks.slice(0, 100), marketIndex };
}
