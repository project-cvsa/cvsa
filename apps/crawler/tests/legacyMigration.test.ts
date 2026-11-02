import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildTimeWindows,
	DEFAULT_BATCH_SIZE,
	DEFAULT_WINDOW_DAYS,
	loadMigrationState,
	parseWindowDays,
	saveMigrationState,
	toMetadataInsertRow,
	toSnapshotInsertRow,
	toTrackingInsertRow,
	windowKey,
} from "../scripts/legacy";
import { parseMigrationCliArgs } from "../scripts/migrate-legacy";

describe("legacy migration helpers and time-window state", () => {
	test("buildTimeWindows partitions [minDate, maxDate] into contiguous half-open intervals", () => {
		const minDate = new Date("2025-01-01T00:00:00.000Z");
		const maxDate = new Date("2025-01-15T00:00:00.000Z");

		const windows = buildTimeWindows(minDate, maxDate, 7);
		expect(windows).toHaveLength(3);
		expect(windows[0]).toEqual({
			index: 0,
			rangeStart: "2025-01-01T00:00:00.000Z",
			rangeEnd: "2025-01-08T00:00:00.000Z",
			sourceChunkName: null,
		});
		expect(windows[1]).toEqual({
			index: 1,
			rangeStart: "2025-01-08T00:00:00.000Z",
			rangeEnd: "2025-01-15T00:00:00.000Z",
			sourceChunkName: null,
		});
		expect(windows[2]).toEqual({
			index: 2,
			rangeStart: "2025-01-15T00:00:00.000Z",
			rangeEnd: "2025-01-15T00:00:00.001Z",
			sourceChunkName: null,
		});
	});

	test("buildTimeWindows handles single-instant bounds", () => {
		const instant = new Date("2025-06-01T12:34:56.789Z");
		const windows = buildTimeWindows(instant, instant, 7);
		expect(windows).toHaveLength(1);
		expect(windows[0]?.rangeStart).toBe("2025-06-01T12:34:56.789Z");
		expect(windows[0]?.rangeEnd).toBe("2025-06-01T12:34:56.790Z");
	});

	test("parseWindowDays validates positive integers and falls back to default", () => {
		expect(parseWindowDays(undefined)).toBe(DEFAULT_WINDOW_DAYS);
		expect(parseWindowDays("14")).toBe(14);
		expect(parseWindowDays("0")).toBe(DEFAULT_WINDOW_DAYS);
		expect(parseWindowDays("-5")).toBe(DEFAULT_WINDOW_DAYS);
		expect(parseWindowDays("abc")).toBe(DEFAULT_WINDOW_DAYS);
	});

	test("loadMigrationState and saveMigrationState persist completed windows for resume", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "cvsa-snapshot-mig-"));
		const statePath = join(tempDir, "state.json");

		try {
			const initial = loadMigrationState(statePath);
			expect(initial.totalRowsMigrated).toBe(0);
			expect(Object.keys(initial.completedWindows)).toHaveLength(0);

			const key = windowKey({
				rangeStart: "2025-01-01T00:00:00.000Z",
				rangeEnd: "2025-01-08T00:00:00.000Z",
			});
			initial.completedWindows[key] = {
				rangeStart: "2025-01-01T00:00:00.000Z",
				rangeEnd: "2025-01-08T00:00:00.000Z",
				rowsMigrated: 250_000,
				completedAt: "2026-10-30T10:00:00.000Z",
			};
			initial.totalRowsMigrated = 250_000;

			saveMigrationState(statePath, initial);

			const reloaded = loadMigrationState(statePath);
			expect(reloaded.totalRowsMigrated).toBe(250_000);
			expect(reloaded.completedWindows[key]?.rowsMigrated).toBe(250_000);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	test("parseMigrationCliArgs parses flags and --snapshots-only mode", () => {
		const opts = parseMigrationCliArgs([
			"--legacy-db=postgres://legacy:pass@old-vps:5432/cvsa",
			"--snapshot-db=postgres://cvsa:pass@new-vps:5433/cvsa_snapshot",
			"--snapshots-only",
			"--window-days=14",
			"--batch-size=50000",
			"--no-compress",
			"--dry-run",
			"--since=2024-01-01T00:00:00.000Z",
			"--until=2025-01-01T00:00:00.000Z",
			"--max-windows=5",
		]);

		expect(opts.legacyDbUrl).toBe("postgres://legacy:pass@old-vps:5432/cvsa");
		expect(opts.snapshotDbUrl).toBe("postgres://cvsa:pass@new-vps:5433/cvsa_snapshot");
		expect(opts.includeTracking).toBe(false);
		expect(opts.includeMetadata).toBe(false);
		expect(opts.includeSnapshots).toBe(true);
		expect(opts.windowDays).toBe(14);
		expect(opts.batchSize).toBe(50_000);
		expect(opts.compressChunks).toBe(false);
		expect(opts.dryRun).toBe(true);
		expect(opts.since?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
		expect(opts.until?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
		expect(opts.maxWindows).toBe(5);
	});

	test("parseMigrationCliArgs uses default batch size when omitted", () => {
		const opts = parseMigrationCliArgs([
			"--legacy-db=postgres://legacy:pass@old-vps:5432/cvsa",
		]);
		expect(opts.batchSize).toBe(DEFAULT_BATCH_SIZE);
		expect(opts.compressChunks).toBe(true);
		expect(opts.includeTracking).toBe(true);
		expect(opts.includeMetadata).toBe(true);
		expect(opts.includeSnapshots).toBe(true);
	});

	test("row mappers normalize legacy snapshot, tracking, and metadata rows", () => {
		const snap = toSnapshotInsertRow({
			id: 42,
			aid: "170001",
			created_at: new Date("2025-03-10T08:00:00.000Z"),
			views: 1000,
			coins: 20,
			likes: 50,
			favorites: 30,
			shares: 10,
			danmakus: 5,
			replies: 2,
		});
		expect(snap).toEqual({
			aid: "170001",
			capturedAt: "2025-03-10T08:00:00.000Z",
			views: 1000,
			coins: 20,
			likes: 50,
			favorites: 30,
			shares: 10,
			danmakus: 5,
			replies: 2,
		});

		const tracking = toTrackingInsertRow({
			aid: "170001",
			schedule_type: "milestone",
			schedule_started_at: null,
			current_views: 99_500,
			velocity: 120.5,
			eta_hours: 4.2,
			target_milestone: 100_000,
			next_snapshot: "2025-03-10T09:00:00.000Z",
			published_at: "2025-03-01T00:00:00.000Z",
		});
		expect(tracking.state).toBe("milestone");
		expect(tracking.priority).toBe(1);
		expect(tracking.lastViews).toBe(99_500);

		const meta = toMetadataInsertRow({
			aid: "170001",
			bvid: null,
			title: "测试曲",
			description: "desc",
			cover_url: "https://example.com/pic.jpg",
			published_at: "2025-03-01T00:00:00.000Z",
			duration: 240,
			uid: "999",
			tags: "VOCALOID, 洛天依",
			created_at: "2025-03-02T00:00:00.000Z",
		});
		expect(meta.bvid).toBe("av170001");
		expect(meta.tags).toEqual(["VOCALOID", "洛天依"]);
	});
});
