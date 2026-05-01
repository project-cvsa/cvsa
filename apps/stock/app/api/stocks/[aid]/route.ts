import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { snapToGrid, lookbackHours, RANGE_CONFIG, DEFAULT_RANGE } from "@/lib/stock-constants";
import {
	fetchEtaEntry,
	fetchCacheMap,
	fetchTitleMap,
	fetchSnapshotsByAid,
	insertCacheEntries,
} from "@/lib/stock-repository";
import { isFullyCached, computeSingleStock } from "@/lib/stock-compute";

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

		const sql = getSql();
		const etaEntry = await fetchEtaEntry(sql, aidNum);
		if (!etaEntry) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		const now = snapToGrid(Date.now());
		const lookback = new Date(now.getTime() - lookbackHours(windowCount) * 3600 * 1000);

		const [titleMap, cacheMap] = await Promise.all([
			fetchTitleMap(sql, [aidNum]),
			fetchCacheMap(sql, [aidNum], lookback),
		]);

		const existingCacheKeys = new Set(cacheMap.keys());

		let snapshotsByAid: Map<number, import("@/lib/stock-repository").SnapshotRow[]> = new Map();
		if (!isFullyCached(aidNum, cacheMap, now, windowCount)) {
			snapshotsByAid = await fetchSnapshotsByAid(sql, [aidNum], lookback);
		}

		const meta = titleMap.get(aidNum);
		const name = meta?.title ?? `AV${aidNum}`;
		const symbol = meta?.bvid ?? `AV${aidNum}`;
		const snapshots = snapshotsByAid.get(aidNum) ?? [];

		const result = computeSingleStock(
			aidNum,
			name,
			symbol,
			cacheMap,
			snapshots,
			now,
			windowCount
		);

		const baseTime = now.toISOString();

		if (!result) {
			return NextResponse.json({
				stock: {
					id: aidNum.toString(),
					name,
					symbol,
					price: 0,
					change: 0,
					changePercent: 0,
					sparkline: [],
				},
				eta: {
					speed: etaEntry.speed,
					currentViews: etaEntry.current_views,
					updatedAt: etaEntry.updated_at.toISOString(),
				},
				baseTime,
			});
		}

		await insertCacheEntries(sql, result.newCacheEntries, existingCacheKeys);

		return NextResponse.json({
			stock: result.stock,
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

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: "Failed to blacklist" }, { status: 500 });
	}
}
