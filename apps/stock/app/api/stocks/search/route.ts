import { type NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { snapToGrid, TOTAL_LOOKBACK_HOURS } from "@/lib/stock-constants";
import {
	searchAids,
	fetchEtaEntriesByAids,
	fetchCacheMap,
	fetchTitleMap,
	fetchSnapshotsByAid,
	insertCacheEntries,
} from "@/lib/stock-repository";
import { isFullyCached, computeStocks } from "@/lib/stock-compute";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const q = searchParams.get("q")?.trim();
		if (!q) {
			return NextResponse.json({ stocks: [] });
		}

		const sql = getSql();
		const aids = await searchAids(sql, q);
		if (aids.length === 0) {
			return NextResponse.json({ stocks: [] });
		}

		const now = snapToGrid(Date.now());
		const lookback = new Date(now.getTime() - TOTAL_LOOKBACK_HOURS * 3600 * 1000);

		const [etaEntries, titleMap, cacheMap] = await Promise.all([
			fetchEtaEntriesByAids(sql, aids),
			fetchTitleMap(sql, aids),
			fetchCacheMap(sql, aids, lookback),
		]);

		const existingCacheKeys = new Set(cacheMap.keys());

		const uncachedAids = aids.filter((aid) => !isFullyCached(aid, cacheMap, now));
		const snapshotsByAid = await fetchSnapshotsByAid(sql, uncachedAids, lookback);

		const { stocks, newCacheEntries } = computeStocks(
			etaEntries,
			titleMap,
			cacheMap,
			snapshotsByAid,
			now
		);

		await insertCacheEntries(sql, newCacheEntries, existingCacheKeys);

		return NextResponse.json({ stocks });
	} catch (error) {
		console.error("Search failed:", error);
		return NextResponse.json({ error: "Search failed" }, { status: 500 });
	}
}
