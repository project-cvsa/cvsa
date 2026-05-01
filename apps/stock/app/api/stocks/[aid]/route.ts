import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import {
	snapToGrid,
	lookbackHours,
	RANGE_CONFIG,
	DEFAULT_RANGE,
	STEP_PER_WINDOW,
	STEP_HOURS_MS,
} from "@/lib/stock-constants";
import {
	fetchEtaEntry,
	fetchCacheMap,
	fetchTitleMap,
	fetchSnapshotsByAid,
	insertCacheEntries,
} from "@/lib/stock-repository";
import { computeSingleStock } from "@/lib/stock-compute";
import { getRedis } from "@/lib/redis";

export async function GET(request: Request, { params }: { params: Promise<{ aid: string }> }) {
	try {
		const { aid } = await params;
		const aidNum = Number(aid);
		if (Number.isNaN(aidNum)) {
			return NextResponse.json({ error: "Invalid aid" }, { status: 400 });
		}

		const { searchParams } = new URL(request.url);
		const rangeKey = searchParams.get("range") ?? DEFAULT_RANGE;
		const windowCount = RANGE_CONFIG[rangeKey] ?? RANGE_CONFIG[DEFAULT_RANGE];
		console.log(rangeKey);

		const sql = getSql();
		const etaEntry = await fetchEtaEntry(sql, aidNum);
		if (!etaEntry) return null;

		const now = snapToGrid(Date.now());
		const lookback = new Date(now.getTime() - lookbackHours(windowCount) * 3600 * 1000);
		console.log("lookback", lookback);

		const [titleMap, cacheMap, snapshotsByAid] = await Promise.all([
			fetchTitleMap(sql, [aidNum]),
			fetchCacheMap(sql, [aidNum], lookback),
			fetchSnapshotsByAid(sql, [aidNum], lookback),
		]);

		const existingCacheKeys = new Set(cacheMap.keys());

		const meta = titleMap.get(aidNum);
		const name = meta?.title ?? `AV${aidNum}`;
		const symbol = meta?.bvid ?? `AV${aidNum}`;
		const snapshots = snapshotsByAid.get(aidNum) ?? [];

		const computed = computeSingleStock(
			aidNum,
			name,
			symbol,
			cacheMap,
			snapshots,
			now,
			true,
			windowCount
		);

		const baseTime = now.toISOString();

		const stock = computed
			? computed.stock
			: {
					id: aidNum.toString(),
					name,
					symbol,
					price: 0,
					change: 0,
					changePercent: 0,
					sparkline: [] as number[],
				};

		const positives = stock.sparkline.filter((v) => v > 0);
		const yesterdayIdx = stock.sparkline.length - 1 - STEP_PER_WINDOW;

		// open = the value at the most recent Monday 08:00 CST (= Monday 00:00 UTC)
		// before now. Find the sparkline window closest to that time.
		const mondayUtc = new Date(now);
		const dow = mondayUtc.getUTCDay();
		mondayUtc.setUTCDate(mondayUtc.getUTCDate() - (dow === 0 ? 6 : dow - 1));
		mondayUtc.setUTCHours(0, 0, 0, 0);
		const stepsToMonday = Math.round((now.getTime() - mondayUtc.getTime()) / STEP_HOURS_MS);
		const openIdx = stock.sparkline.length - 1 - stepsToMonday;
		const mondayOpen =
			openIdx >= 0 && openIdx < stock.sparkline.length && stock.sparkline[openIdx] > 0
				? stock.sparkline[openIdx]
				: positives.length > 0
					? positives[0]
					: 0;

		const fields = {
			open: mondayOpen,
			high: positives.length > 0 ? Math.max(...positives) : 0,
			low: positives.length > 0 ? Math.min(...positives) : 0,
			yesterdayGrowth:
				yesterdayIdx >= 0 && yesterdayIdx < stock.sparkline.length
					? stock.sparkline[yesterdayIdx]
					: 0,
			views: etaEntry.current_views,
		};

		if (computed) {
			await insertCacheEntries(sql, computed.newCacheEntries, existingCacheKeys);
		}

		return NextResponse.json({
			stock,
			fields,
			eta: {
				speed: etaEntry.speed,
				currentViews: etaEntry.current_views,
				updatedAt: etaEntry.updated_at.toISOString(),
			},
			baseTime,
		});
	} catch (error) {
		console.error("Failed to fetch stock detail:", error);
		return NextResponse.json({ error: "Failed to fetch stock detail" }, { status: 500 });
	}
}

export async function DELETE(request: Request, { params }: { params: Promise<{ aid: string }> }) {
	try {
		const authHeader = request.headers.get("authorization");
		const token = authHeader?.replace("Bearer ", "");

		if (!token || !(await verifyToken(token))) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { aid } = await params;
		const aidNum = Number(aid);

		if (Number.isNaN(aidNum)) {
			return NextResponse.json({ error: "Invalid aid" }, { status: 400 });
		}

		const sql = getSql();
		await sql`
			INSERT INTO public.video_blacklist (aid)
			SELECT ${aidNum}
			WHERE NOT EXISTS (
				SELECT 1 FROM public.video_blacklist WHERE aid = ${aidNum}
			)
		`;

		const redis = getRedis();
		await redis.del("cvsa:stock:eta:top500");

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: "Failed to blacklist" }, { status: 500 });
	}
}
