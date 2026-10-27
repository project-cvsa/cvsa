import { describe, expect, test } from "bun:test";
import { toInstant, type BilibiliVideoMetadata } from "@cvsa/snapshot-db";
import {
	BilibiliClient,
	changeTypeForDiff,
	diffMetadata,
	DiscoveryFilterService,
	DiscoveryPipelineProcessor,
	DiscoveryScheduler,
	DiscoveryService,
	normalizeFilterConfig,
	RelationExtractor,
	SearchRover,
	type BilibiliHttpResponse,
	type DiscoveryJobData,
} from "../src/crawler";
import {
	createFakeMq,
	createTrackingRow,
	InMemoryDiscoveryRepository,
	InMemoryFilterConfigStore,
	InMemoryTrackingRepository,
} from "../src/crawler/testing/fakes";

// ------------------------------------------------------------------ fixtures

const WBI_STUB = {
	finger: { code: 0, message: "0", data: { b_3: "b3", b_4: "b4" } },
	ticket: {
		code: 0,
		message: "0",
		data: {
			ticket: "t",
			nav: {
				img: "7cd084481338484ba0e08a3d8beb9821",
				sub: "435cd5968e7d4d429a39f65342bc6761",
			},
		},
	},
};

interface DetailOverrides {
	title?: string;
	tags?: Array<{ tag_id: number; tag_name: string; tag_type: string; music_id: string }>;
	related?: unknown[];
	honorReply?: Record<string, unknown>;
	duration?: number;
	descV2?: unknown;
	state?: number;
	desc?: string;
}

/** Build one `View`/`Card`/`Tags` payload shaped like the real `view/detail`. */
function detailPayload(aid: number, overrides: DetailOverrides = {}) {
	return {
		View: {
			aid,
			bvid: `BV1${String(aid).padStart(9, "0")}`,
			cid: 1000 + aid,
			videos: 1,
			tid: 31,
			tid_v2: 2020,
			tname: "原创音乐",
			tname_v2: "原创音乐",
			copyright: 1,
			pic: `https://example.com/${aid}.jpg`,
			title: overrides.title ?? `【洛天依原创】视频 ${aid}`,
			desc: overrides.desc ?? "洛天依 原创曲",
			desc_v2: overrides.descV2 ?? [
				{ raw_text: overrides.desc ?? "洛天依 原创曲", type: 1, biz_id: 0 },
			],
			pubdate: 1_600_000_000,
			ctime: 1_600_000_100,
			state: overrides.state ?? 0,
			duration: overrides.duration ?? 240,
			owner: { mid: 888, name: "ryo", face: "https://example.com/face.jpg" },
			stat: { aid, view: 10_000_000 },
			dynamic: "",
			dimension: { width: 1920, height: 1080, rotate: 0 },
			pages: [
				{
					cid: 1000 + aid,
					page: 1,
					from: "vupload",
					part: "p1",
					duration: overrides.duration ?? 240,
					vid: "",
					weblink: "",
					dimension: { width: 1920, height: 1080, rotate: 0 },
					first_frame: "",
					ctime: 1_600_000_100,
				},
			],
			staff: [{ mid: 888, title: "UP主", name: "ryo", face: "", follower: 10 }],
			rights: { bp: 0, elec: 0, download: 1, movie: 0, pay: 0, hd5: 0 },
			honor_reply: overrides.honorReply ?? {},
		},
		Card: { card: { name: "ryo", face: "https://example.com/face.jpg" } },
		Tags: overrides.tags ?? [
			{
				tag_id: 0,
				tag_name: "洛天依",
				tag_type: "topic",
				music_id: "",
				jump_url: "",
			},
			{
				tag_id: 3878,
				tag_name: "原创曲",
				tag_type: "topic",
				music_id: "",
				jump_url: "",
			},
		],
		Related: overrides.related ?? [],
	};
}

/**
 * Bilibili stub that answers the WBI handshake plus `view/detail` for a fixed
 * set of aids, so the discovery pipeline can be exercised end-to-end offline.
 */
function createDetailClient(
	details: Map<number, DetailOverrides>,
	options: { searchResult?: unknown[] } = {}
): BilibiliClient {
	return new BilibiliClient({
		request: async (url, init): Promise<BilibiliHttpResponse> => {
			const headers: Record<string, string> = {};
			if (init?.method === "HEAD") {
				headers["set-cookie"] = "b_nut=12345; Path=/";
				return { status: 200, headers, body: "" };
			}
			if (url.includes("/x/frontend/finger/spi")) {
				return { status: 200, headers, body: JSON.stringify(WBI_STUB.finger) };
			}
			if (url.includes("Ticket/GenWebTicket")) {
				return { status: 200, headers, body: JSON.stringify(WBI_STUB.ticket) };
			}
			if (url.includes("/x/web-interface/nav")) {
				return {
					status: 200,
					headers,
					body: JSON.stringify({
						code: 0,
						message: "0",
						data: {
							isLogin: false,
							wbi_img: {
								img_url:
									"https://i0.hdslb.com/bfs/wbi/7cd084481338484ba0e08a3d8beb9821.png",
								sub_url:
									"https://i0.hdslb.com/bfs/wbi/435cd5968e7d4d429a39f65342bc6761.png",
							},
						},
					}),
				};
			}
			if (url.includes("/x/web-interface/wbi/search/type")) {
				return {
					status: 200,
					headers,
					body: JSON.stringify({
						code: 0,
						message: "0",
						data: {
							seid: "test-seid",
							page: 1,
							pagesize: 20,
							numResults: options.searchResult?.length ?? 0,
							numPages: 1,
							result: options.searchResult ?? [],
						},
					}),
				};
			}
			if (url.includes("/x/web-interface/wbi/view/detail")) {
				const aid = Number(new URL(url).searchParams.get("aid"));
				const overrides = details.get(aid);
				if (!overrides) {
					return {
						status: 200,
						headers,
						body: JSON.stringify({ code: -404, message: "啥都木有", data: null }),
					};
				}
				return {
					status: 200,
					headers,
					body: JSON.stringify({
						code: 0,
						message: "0",
						data: detailPayload(aid, overrides),
					}),
				};
			}
			return { status: 200, headers, body: "{}" };
		},
	});
}

function searchVideo(aid: number, title: string) {
	return {
		type: "video",
		id: aid,
		aid,
		bvid: `BV1${String(aid).padStart(9, "0")}`,
		title,
		description: "洛天依 原创曲",
		pic: "//i0.hdslb.com/bfs/archive/pic.jpg",
		author: "COP",
		mid: 9999,
		typeid: "31",
		typename: "原创音乐",
		arcurl: "",
		play: 5_000_000,
		video_review: 10_000,
		favorites: 200_000,
		tag: "洛天依,原创曲,VOCALOID",
		review: 5_000,
		pubdate: 1_444_824_000,
		senddate: 1_444_824_000,
		duration: "03:45",
		like: 300_000,
		upic: "//i0.hdslb.com/bfs/face/upic.jpg",
		danmaku: 80_000,
	};
}

// ------------------------------------------------------------------ metadata

describe("metadata change detection", () => {
	const baseRow = {
		aid: 1n,
		bvid: "BV1",
		cid: null,
		videos: 1,
		tid: 31,
		tidV2: null,
		tname: "原创音乐",
		tnameV2: null,
		copyright: 1,
		pic: "https://example.com/a.jpg",
		title: "旧标题",
		pubdate: null,
		ctime: null,
		description: "旧简介",
		descV2: null,
		state: 0,
		duration: 200,
		Dynamic: null,
		dimension: null,
		mid: null,
		ownerName: "洛天依",
		ownerFace: null,
		pages: null,
		staff: null,
		rights: null,
		honorReply: null,
		tags: [{ name: "洛天依" }],
		videoStatus: "normal",
		filterDecision: "accepted",
		modelScore: null,
		modelVersion: null,
		discoverySource: null,
		capturedAt: toInstant(new Date()),
		updatedAt: toInstant(new Date()),
	} satisfies BilibiliVideoMetadata;

	test("returns no diff when the tracked fields are unchanged", () => {
		const diff = diffMetadata(baseRow, { aid: 1n, bvid: "BV1", title: "旧标题" });
		expect(diff).toEqual({});
		expect(changeTypeForDiff(diff)).toBeUndefined();
	});

	test("reports only the fields that actually changed", () => {
		const diff = diffMetadata(baseRow, {
			aid: 1n,
			bvid: "BV1",
			title: "新标题",
			duration: 200,
		});
		expect(Object.keys(diff)).toEqual(["title"]);
		expect(diff.title).toEqual({ old: "旧标题", new: "新标题" });
		expect(changeTypeForDiff(diff)).toBe("updated");
	});

	test("classifies a takedown as status_changed", () => {
		const diff = diffMetadata(baseRow, {
			aid: 1n,
			bvid: "BV1",
			title: "旧标题",
			videoStatus: "deleted",
		});
		expect(changeTypeForDiff(diff)).toBe("status_changed");
	});
});

// ------------------------------------------------------------------ relations

describe("RelationExtractor", () => {
	test("preserves exact recommendation position sequence and persists metadata", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const extractor = new RelationExtractor(repo);

		const sourceAid = 100_001n;
		const relatedItems = [0, 1].map((offset) => {
			const aid = 200_001 + offset;
			return {
				aid,
				bvid: `BV1${aid}`,
				title: `Recommended Song ${offset + 1}`,
				pic: `https://example.com/pic${offset + 1}.jpg`,
				owner: { mid: 11 + offset, name: `Producer ${offset}`, face: "" },
				stat: {
					aid,
					view: 10_000,
					danmaku: 100,
					reply: 50,
					favorite: 200,
					coin: 300,
					share: 40,
					now_rank: 0,
					his_rank: 0,
					like: 500,
				},
				pubdate: 1_700_000_000 + offset,
				duration: 210,
			};
		});

		const result = await extractor.extractAndPersist(sourceAid, relatedItems);
		expect(result.relationsCount).toBe(2);
		expect(result.candidates.map((c) => c.position)).toEqual([0, 1]);

		const saved = await repo.getRelationsBySource(sourceAid);
		expect(saved.map((r) => r.targetAid)).toEqual([200_001n, 200_002n]);

		const meta = await repo.getMetadata(200_001n);
		expect(meta?.title).toBe("Recommended Song 1");
		expect(meta?.ownerName).toBe("Producer 0");
		expect(meta?.duration).toBe(210);
	});

	test("does not overwrite richer metadata with a shallow recommendation payload", async () => {
		const repo = new InMemoryDiscoveryRepository();
		await repo.upsertMetadata({
			aid: 300_001n,
			bvid: "BV1300001",
			title: "Rich",
			discoverySource: "search",
			pages: [{ cid: 1 }],
			staff: [{ mid: 1 }],
			tags: [{ name: "洛天依" }],
			videoStatus: "private",
		});

		const extractor = new RelationExtractor(repo);
		await extractor.extractAndPersist(300_000n, [
			{
				aid: 300_001,
				bvid: "BV1300001",
				title: "Shallow",
				pic: "",
				owner: { mid: 1, name: "x", face: "" },
				stat: {
					aid: 300_001,
					view: 0,
					danmaku: 0,
					reply: 0,
					favorite: 0,
					coin: 0,
					share: 0,
					now_rank: 0,
					his_rank: 0,
					like: 0,
				},
			},
		]);

		const meta = await repo.getMetadata(300_001n);
		expect(meta?.title).toBe("Rich");
		expect(meta?.videoStatus).toBe("private");
		expect(meta?.pages).toEqual([{ cid: 1 }]);
	});
});

// ------------------------------------------------------------------ search

describe("SearchRover", () => {
	test("cleans highlighted HTML tags, parses duration, and stores structured tags", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const client = createDetailClient(new Map(), {
			searchResult: [searchVideo(300_001, '【<em class="keyword">洛天依</em>原创】霜雪千年')],
		});

		const rover = new SearchRover(client, repo);
		const candidates = await rover.runSearchQuery("洛天依原创");

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.title).toBe("【洛天依原创】霜雪千年");

		const meta = await repo.getMetadata(300_001n);
		expect(meta?.description).toBe("洛天依 原创曲");
		expect(meta?.pic).toBe("https://i0.hdslb.com/bfs/archive/pic.jpg");
		expect(meta?.duration).toBe(225);
		expect(meta?.tags).toEqual([{ name: "洛天依" }, { name: "原创曲" }, { name: "VOCALOID" }]);
	});
});

// ------------------------------------------------------------------ service

describe("DiscoveryService", () => {
	test("routes recommendation candidates through detail fetch and the filter", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const tracking = new InMemoryTrackingRepository();
		// Already tracked: must not be re-evaluated.
		await tracking.upsertTracking({
			aid: 400_001n,
			state: "regular",
			nextSnapshotAt: toInstant(new Date()),
		});

		const client = createDetailClient(
			new Map([
				[400_002, { title: "【洛天依原创】新曲" }],
				// Not a song: mentions nothing in the whitelist and is a live recording.
				[400_003, { title: "【某游戏】直播录像切片", desc: "游戏", tags: [] }],
			])
		);
		// The related list is supplied directly; the service only fetches details.
		const service = new DiscoveryService(client, repo, tracking, new DiscoveryFilterService());

		const result = await service.processVideoRecommendations(999_999n, [
			{
				aid: 400_001,
				bvid: "BV1400001",
				title: "Already Tracked Song",
				pic: "",
				owner: { mid: 1, name: "A", face: "" },
				stat: {
					aid: 400_001,
					view: 100,
					danmaku: 0,
					reply: 0,
					favorite: 0,
					coin: 0,
					share: 0,
					now_rank: 0,
					his_rank: 0,
					like: 0,
				},
			},
			{
				aid: 400_002,
				bvid: "BV1400002",
				title: "【洛天依原创】新曲",
				pic: "",
				owner: { mid: 2, name: "B", face: "" },
				stat: {
					aid: 400_002,
					view: 200,
					danmaku: 0,
					reply: 0,
					favorite: 0,
					coin: 0,
					share: 0,
					now_rank: 0,
					his_rank: 0,
					like: 0,
				},
			},
			{
				aid: 400_003,
				bvid: "BV1400003",
				title: "【某游戏】直播录像切片",
				pic: "",
				owner: { mid: 3, name: "C", face: "" },
				stat: {
					aid: 400_003,
					view: 300,
					danmaku: 0,
					reply: 0,
					favorite: 0,
					coin: 0,
					share: 0,
					now_rank: 0,
					his_rank: 0,
					like: 0,
				},
			},
		]);

		expect(result.relationsCount).toBe(3);
		// Only the whitelisted song is promoted; the game livestream never enters tracking.
		expect(result.newTracked).toBe(1);
		expect(await tracking.getTracking(400_002n)).not.toBeNull();
		expect(await tracking.getTracking(400_003n)).toBeNull();

		const accepted = await tracking.getTracking(400_002n);
		expect(accepted?.state).toBe("new");
		const meta = await repo.getMetadata(400_002n);
		expect(meta?.filterDecision).toBe("accepted");
		expect(meta?.discoverySource).toBe("related");
	});

	test("search sweep promotes only candidates that clear the filter", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const tracking = new InMemoryTrackingRepository();
		const client = createDetailClient(
			new Map([
				[500_001, { title: "【洛天依原创】霜雪千年" }],
				[500_002, { title: "【王者荣耀】五杀集锦", desc: "游戏", tags: [] }],
			]),
			{
				searchResult: [
					searchVideo(500_001, "【洛天依原创】霜雪千年"),
					searchVideo(500_002, "【王者荣耀】五杀集锦"),
				],
			}
		);

		const service = new DiscoveryService(client, repo, tracking, new DiscoveryFilterService());
		const result = await service.runSearchSweep({ keywords: ["洛天依原创"], pagesPerQuery: 1 });

		expect(result.totalDiscovered).toBe(2);
		expect(result.newTracked).toBe(1);
		expect(await tracking.getTracking(500_002n)).toBeNull();
	});

	test("marks deleted videos in metadata and archives their tracking row", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const tracking = new InMemoryTrackingRepository();
		await repo.upsertMetadata({ aid: 600_001n, bvid: "BV1600001", title: "Gone" });
		tracking.trackings.set(600_001n, createTrackingRow(600_001n, { velocity: 5 }));

		// No entry in the stub map => the client answers `code: -404`.
		const client = createDetailClient(new Map());
		const service = new DiscoveryService(client, repo, tracking, new DiscoveryFilterService());

		const result = await service.runSearchSweep({ keywords: ["x"], pagesPerQuery: 1 });
		expect(result.totalDiscovered).toBe(0);

		const evaluation = await service.evaluator.evaluate({
			aid: 600_001n,
			source: "manual",
			force: true,
		});
		expect(evaluation.status).toBe("failed");
		if (evaluation.status === "failed") expect(evaluation.videoStatus).toBe("deleted");

		const meta = await repo.getMetadata(600_001n);
		expect(meta?.videoStatus).toBe("deleted");
		expect(tracking.trackings.get(600_001n)?.state).toBe("archive");
	});
});

// ------------------------------------------------------------------- filter

describe("DiscoveryFilterService", () => {
	test("accepts whitelist singer with song indicator", () => {
		const filter = new DiscoveryFilterService();
		const decision = filter.evaluateVideo({
			title: "【洛天依原创】霜雪千年",
			tags: ["洛天依", "原创曲", "VOCALOID中文曲"],
			duration: 220,
		});

		expect(decision.action).toBe("accept");
		expect(decision.reason).toBe("whitelist_hit");
		expect(decision.confidence).toBe(1);
	});

	test("does not hard-reject by blacklist or duration when whitelist hits", () => {
		const filter = new DiscoveryFilterService();
		const shortWhitelist = filter.evaluateVideo({
			title: "【言和原创】超短试听",
			tags: ["言和", "原创"],
			duration: 15,
		});
		expect(shortWhitelist.action).toBe("accept");
		expect(shortWhitelist.reason).toBe("whitelist_hit");

		const coverWhitelist = filter.evaluateVideo({
			title: "【洛天依原创】带cover字样的原创曲",
			tags: ["洛天依", "原创曲"],
			duration: 1200,
		});
		expect(coverWhitelist.action).toBe("accept");
		expect(coverWhitelist.reason).toBe("whitelist_hit");
	});

	test("rejects non-whitelist candidates without a model", () => {
		const decision = new DiscoveryFilterService().evaluateVideo({
			title: "【某游戏】直播录像切片剪辑",
			tags: ["游戏", "切片"],
			duration: 180,
		});
		expect(decision.action).toBe("reject");
		expect(decision.reason).toBe("model_rejected");
	});

	test("samples rejected candidates according to the sample rate", () => {
		const always = new DiscoveryFilterService({ rejectionSampleRate: 1 });
		expect(
			always.evaluateVideo({ title: "游戏视频", tags: ["游戏"], duration: 300 }).sampled
		).toBe(true);

		const never = new DiscoveryFilterService({ rejectionSampleRate: 0 });
		expect(
			never.evaluateVideo({ title: "游戏视频", tags: ["游戏"], duration: 300 }).sampled
		).toBe(false);
	});

	test("persists operator edits and restores them", async () => {
		const store = new InMemoryFilterConfigStore();
		const filter = new DiscoveryFilterService({ modelThreshold: 0.9 }, store);

		filter.updateConfig({ modelThreshold: 0.75, blacklistKeywords: ["台独"] });
		await filter.flush();

		expect(store.entries.get("discovery")).toBeDefined();

		const restored = new DiscoveryFilterService({}, store);
		await restored.initialize();
		expect(restored.getConfig().modelThreshold).toBe(0.75);
		expect(restored.getConfig().blacklistKeywords).toEqual(["台独"]);
	});

	test("ignores an invalid persisted document instead of corrupting the config", async () => {
		const store = new InMemoryFilterConfigStore();
		store.entries.set("discovery", {
			revision: 3,
			config: { modelThreshold: "nope", minDurationSeconds: -1, blacklistKeywords: [] },
		});

		const filter = new DiscoveryFilterService({}, store);
		await filter.initialize();

		const config = filter.getConfig();
		expect(config.modelThreshold).toBe(0.5);
		expect(config.minDurationSeconds).toBe(45);
		// An emptied blacklist falls back to the default list rather than
		// disabling the guardrail entirely.
		expect(config.blacklistKeywords.length).toBeGreaterThan(0);
	});
});

describe("normalizeFilterConfig", () => {
	test("clamps a ratio and keeps the duration window sane", () => {
		const config = normalizeFilterConfig({
			rejectionSampleRate: 2,
			modelThreshold: -1,
			minDurationSeconds: 900,
			maxDurationSeconds: 60,
		});
		expect(config.rejectionSampleRate).toBe(1);
		expect(config.modelThreshold).toBe(0);
		expect(config.minDurationSeconds).toBe(45);
		expect(config.maxDurationSeconds).toBe(900);
	});
});

// ------------------------------------------------------------------ pipeline

describe("DiscoveryPipelineProcessor", () => {
	test("accepts a candidate, stores structured tags and samples, and enqueues related videos", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const tracking = new InMemoryTrackingRepository();
		const mq = createFakeMq();
		const queue = mq.createQueue<DiscoveryJobData>("crawler-discovery");

		const client = createDetailClient(
			new Map([
				[
					500_001,
					{
						title: "【初音未来原创】世界第一公主殿下",
						honorReply: { honor: [{ type: 1, desc: "百万播放" }] },
						related: [
							{
								aid: 500_002,
								bvid: "BV1500002",
								title: "【初音未来原创】深海少女",
								pic: "",
								owner: { mid: 999, name: "yuuyu", face: "" },
								stat: {
									aid: 500_002,
									view: 5_000_000,
									danmaku: 0,
									reply: 0,
									favorite: 0,
									coin: 0,
									share: 0,
									now_rank: 0,
									his_rank: 0,
									like: 0,
								},
								pubdate: 1_610_000_000,
								duration: 210,
							},
						],
					},
				],
			])
		);

		const processor = new DiscoveryPipelineProcessor(client, repo, tracking, queue);
		await processor.processJob({
			type: "fetch-video-details",
			aid: "500001",
			source: "search",
		});

		const tracked = await tracking.getTracking(500_001n);
		expect(tracked?.state).toBe("new");

		const meta = await repo.getMetadata(500_001n);
		expect(meta?.title).toBe("【初音未来原创】世界第一公主殿下");
		expect(meta?.honorReply).toEqual({ honor: [{ type: 1, desc: "百万播放" }] });
		expect(meta?.descV2).toEqual([{ raw_text: "洛天依 原创曲", type: 1, biz_id: 0 }]);
		expect(meta?.tags).toEqual([
			{ tagId: 0, name: "洛天依", type: "topic", musicId: "" },
			{ tagId: 3878, name: "原创曲", type: "topic", musicId: "" },
		]);
		expect(meta?.discoverySource).toBe("search");
		expect(meta?.filterDecision).toBe("accepted");
		expect(meta?.modelVersion).toBeNull();

		// The accepted candidate is recorded as a labelled sample.
		const samples = await repo.listSamples();
		expect(samples).toHaveLength(1);
		expect(samples[0]?.decision).toBe("whitelist");

		const relations = await repo.getRelationsBySource(500_001n);
		expect(relations).toHaveLength(1);
		expect(relations[0]?.position).toBe(0);

		expect(mq.state.queuedJobs).toHaveLength(1);
		expect(mq.state.queuedJobs[0]?.data).toMatchObject({
			type: "fetch-video-details",
			aid: "500002",
			source: "related",
		});
	});

	test("writes a discovery sample for a sampled rejection instead of tagging it", async () => {
		const repo = new InMemoryDiscoveryRepository();
		const tracking = new InMemoryTrackingRepository();
		const mq = createFakeMq();
		const queue = mq.createQueue<DiscoveryJobData>("crawler-discovery");

		const client = createDetailClient(
			new Map([[700_001, { title: "【某游戏】直播录像", desc: "游戏", tags: [] }]])
		);

		const processor = new DiscoveryPipelineProcessor(
			client,
			repo,
			tracking,
			queue,
			// Sample every rejection so the assertion is deterministic.
			new DiscoveryFilterService({ rejectionSampleRate: 1 })
		);

		await processor.processJob({
			type: "fetch-video-details",
			aid: "700001",
			source: "manual",
		});

		expect(await tracking.getTracking(700_001n)).toBeNull();
		expect(repo.metadatas.size).toBe(0);

		const samples = await repo.listSamples();
		expect(samples).toHaveLength(1);
		expect(samples[0]?.decision).toBe("model_rejected");
		expect(samples[0]?.songProbability).toBe(0.2);
	});

	test("expands recommendations for hot sampled videos", async () => {
		const repo = new InMemoryDiscoveryRepository();
		repo.hotSampleAids = [800_001n, 800_002n];
		const tracking = new InMemoryTrackingRepository();
		const mq = createFakeMq();
		const queue = mq.createQueue<DiscoveryJobData>("crawler-discovery");

		const processor = new DiscoveryPipelineProcessor(
			createDetailClient(new Map()),
			repo,
			tracking,
			queue
		);
		await processor.processJob({ type: "hot-sample", limit: 5 });

		expect(mq.state.queuedJobs).toHaveLength(2);
		expect(mq.state.queuedJobs[0]?.data).toEqual({
			type: "active-discovery",
			aid: "800001",
		});
	});
});

// ----------------------------------------------------------------- scheduler

describe("DiscoveryScheduler", () => {
	test("registers both repeatable jobs and manual triggers", async () => {
		const mq = createFakeMq();
		const queue = mq.createQueue<DiscoveryJobData>("crawler-discovery");
		const scheduler = new DiscoveryScheduler(queue);

		await scheduler.startScheduledSweeps(300_000);
		expect(mq.state.queuedJobs.map((job) => job.name)).toEqual([
			"repeatable-search-sweep",
			"repeatable-hot-sample",
		]);

		await scheduler.triggerDetailFetch(777_777n, "manual");
		expect(mq.state.queuedJobs[2]?.name).toBe("detail-777777");

		await scheduler.triggerHotSample(3);
		expect(mq.state.queuedJobs[3]?.name.startsWith("hot-sample-")).toBe(true);
	});
});
