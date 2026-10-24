import { describe, expect, test } from "bun:test";
import {
	toJson,
	toInstant,
	type BilibiliVideoMetadata,
	type BilibiliVideoRelation,
	type VideoTracking,
} from "@cvsa/snapshot-db";
import {
	BilibiliClient,
	DiscoveryService,
	RelationExtractor,
	SearchRover,
	type BilibiliHttpResponse,
	type IDiscoveryRepository,
	type RelationEdge,
	type UpsertMetadataInput,
} from "../src/crawler";
import type {
	ITrackingRepository,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "../src/crawler/tracking/repository.interface";

class FakeDiscoveryRepository implements IDiscoveryRepository {
	readonly metadatas = new Map<bigint, BilibiliVideoMetadata>();
	readonly relations: BilibiliVideoRelation[] = [];

	async upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata> {
		const now = data.capturedAt ?? toInstant(new Date());
		const meta: BilibiliVideoMetadata = {
			aid: data.aid,
			bvid: data.bvid,
			title: data.title,
			description: data.description ?? null,
			pic: data.pic ?? null,
			pubdate: data.pubdate ?? null,
			duration: data.duration ?? 0,
			mid: data.mid ?? null,
			ownerName: data.ownerName ?? null,
			ownerFace: data.ownerFace ?? null,
			tid: data.tid ?? null,
			tname: data.tname ?? null,
			copyright: data.copyright ?? null,
			tags: toJson(data.tags),
			rawPayload: toJson(data.rawPayload),
			capturedAt: now,
			updatedAt: now,
		};
		this.metadatas.set(data.aid, meta);
		return meta;
	}

	async bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void> {
		for (const item of data) {
			await this.upsertMetadata(item);
		}
	}

	async getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null> {
		return this.metadatas.get(aid) ?? null;
	}

	async getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]> {
		const result: BilibiliVideoMetadata[] = [];
		for (const aid of aids) {
			const m = this.metadatas.get(aid);
			if (m) result.push(m);
		}
		return result;
	}

	async saveRelations(relations: RelationEdge[]): Promise<void> {
		const now = toInstant(new Date());
		for (const r of relations) {
			this.relations.push({
				sourceAid: r.sourceAid,
				targetAid: r.targetAid,
				position: r.position,
				capturedAt: r.capturedAt ?? now,
			});
		}
	}

	async getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]> {
		return this.relations
			.filter((r) => r.sourceAid === sourceAid)
			.sort((a, b) => a.position - b.position);
	}

	async getIncomingRelations(targetAid: bigint, limit = 50): Promise<BilibiliVideoRelation[]> {
		return this.relations.filter((r) => r.targetAid === targetAid).slice(0, limit);
	}
}

class FakeTrackingRepository implements ITrackingRepository {
	readonly trackings = new Map<bigint, VideoTracking>();

	async findDueVideos(_limit: number): Promise<VideoTracking[]> {
		return [...this.trackings.values()];
	}

	async getTracking(aid: bigint): Promise<VideoTracking | null> {
		return this.trackings.get(aid) ?? null;
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		const res: VideoTracking[] = [];
		for (const aid of aids) {
			const t = this.trackings.get(aid);
			if (t) res.push(t);
		}
		return res;
	}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		for (const aid of aids) {
			const existing = this.trackings.get(aid);
			if (existing) {
				this.trackings.set(aid, { ...existing, nextSnapshotAt });
			}
		}
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		const existing = this.trackings.get(input.aid);
		const tracking: VideoTracking = {
			aid: input.aid,
			state: input.state ?? existing?.state ?? "regular",
			nextSnapshotAt: input.nextSnapshotAt,
			lastViews: input.lastViews ?? existing?.lastViews ?? 0,
			lastCapturedAt: input.lastCapturedAt ?? existing?.lastCapturedAt ?? null,
			velocity: input.velocity ?? existing?.velocity ?? 0,
			targetMilestone: input.targetMilestone ?? existing?.targetMilestone ?? null,
			etaHours: input.etaHours ?? existing?.etaHours ?? null,
			publishedAt: input.publishedAt ?? existing?.publishedAt ?? null,
			priority: input.priority ?? existing?.priority ?? 2,
			consecutiveFails: input.consecutiveFails ?? existing?.consecutiveFails ?? 0,
			updatedAt: toInstant(new Date()),
		};
		this.trackings.set(input.aid, tracking);
		return tracking;
	}

	async updateSchedule(aid: bigint, update: UpdateScheduleInput): Promise<void> {
		const existing = this.trackings.get(aid);
		if (!existing) return;
		this.trackings.set(aid, {
			...existing,
			...(update.state ? { state: update.state } : {}),
			nextSnapshotAt: update.nextSnapshotAt,
			...(update.lastViews !== undefined ? { lastViews: update.lastViews } : {}),
			...(update.velocity !== undefined ? { velocity: update.velocity } : {}),
			...(update.priority !== undefined ? { priority: update.priority } : {}),
			...(update.consecutiveFails !== undefined
				? { consecutiveFails: update.consecutiveFails }
				: {}),
		});
	}
}

describe("RelationExtractor", () => {
	test("preserves exact recommendation position sequence and persists metadata", async () => {
		const discoveryRepo = new FakeDiscoveryRepository();
		const extractor = new RelationExtractor(discoveryRepo);

		const sourceAid = 100001n;
		const relatedItems = [
			{
				aid: 200001,
				bvid: "BV1200001",
				title: "Recommended Song 1",
				pic: "https://example.com/pic1.jpg",
				owner: { mid: 11, name: "Producer A", face: "https://example.com/a.jpg" },
				stat: {
					aid: 200001,
					view: 10000,
					danmaku: 100,
					reply: 50,
					favorite: 200,
					coin: 300,
					share: 40,
					now_rank: 0,
					his_rank: 0,
					like: 500,
				},
				pubdate: 1700000000,
				duration: 210,
			},
			{
				aid: 200002,
				bvid: "BV1200002",
				title: "Recommended Song 2",
				pic: "https://example.com/pic2.jpg",
				owner: { mid: 12, name: "Producer B", face: "https://example.com/b.jpg" },
				stat: {
					aid: 200002,
					view: 5000,
					danmaku: 50,
					reply: 25,
					favorite: 100,
					coin: 150,
					share: 20,
					now_rank: 0,
					his_rank: 0,
					like: 250,
				},
				pubdate: 1700001000,
				duration: 180,
			},
		];

		const result = await extractor.extractAndPersist(sourceAid, relatedItems);
		expect(result.relationsCount).toBe(2);
		expect(result.candidates).toHaveLength(2);

		// Verify exact 0-indexed order
		expect(result.candidates[0].position).toBe(0);
		expect(result.candidates[0].aid).toBe(200001n);
		expect(result.candidates[1].position).toBe(1);
		expect(result.candidates[1].aid).toBe(200002n);

		// Verify relations saved in repository
		const savedRelations = await discoveryRepo.getRelationsBySource(sourceAid);
		expect(savedRelations).toHaveLength(2);
		expect(savedRelations[0].position).toBe(0);
		expect(savedRelations[0].targetAid).toBe(200001n);
		expect(savedRelations[1].position).toBe(1);
		expect(savedRelations[1].targetAid).toBe(200002n);

		// Verify metadata saved
		const meta1 = await discoveryRepo.getMetadata(200001n);
		expect(meta1).toBeDefined();
		expect(meta1?.title).toBe("Recommended Song 1");
		expect(meta1?.ownerName).toBe("Producer A");
		expect(meta1?.duration).toBe(210);
	});
});

describe("SearchRover", () => {
	test("cleans highlighted HTML tags and parses duration correctly", async () => {
		const discoveryRepo = new FakeDiscoveryRepository();
		const client = new BilibiliClient({
			request: async (url, options): Promise<BilibiliHttpResponse> => {
				const headers: Record<string, string> = {};
				if (options?.method === "HEAD") {
					headers["set-cookie"] = "b_nut=12345; Path=/";
					return {
						status: 200,
						headers,
						body: "",
					};
				}
				if (url.includes("/x/frontend/finger/spi")) {
					return {
						status: 200,
						headers,
						body: JSON.stringify({
							code: 0,
							message: "0",
							data: { b_3: "fake_b3", b_4: "fake_b4" },
						}),
					};
				}
				if (url.includes("Ticket/GenWebTicket")) {
					return {
						status: 200,
						headers,
						body: JSON.stringify({
							code: 0,
							message: "0",
							data: {
								ticket: "fake_ticket",
								nav: {
									img: "7cd084481338484ba0e08a3d8beb9821",
									sub: "435cd5968e7d4d429a39f65342bc6761",
								},
							},
						}),
					};
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
							numResults: 1,
							numPages: 1,
							result: [
								{
									type: "video",
									id: 300001,
									aid: 300001,
									bvid: "BV1300001",
									title: '【<em class="keyword">洛天依</em>原创】霜雪千年',
									description: '经典<em class="keyword">洛天依</em>曲目',
									pic: "//i0.hdslb.com/bfs/archive/pic.jpg",
									author: "COP",
									mid: 9999,
									typeid: "31",
									typename: "原创音乐",
									arcurl: "https://www.bilibili.com/video/BV1300001",
									play: 5000000,
									video_review: 10000,
									favorites: 200000,
									tag: "洛天依,原创音乐,VOCALOID",
									review: 5000,
									pubdate: 1444824000,
									senddate: 1444824000,
									duration: "03:45",
									like: 300000,
									upic: "//i0.hdslb.com/bfs/face/upic.jpg",
									danmaku: 80000,
								},
							],
						},
					}),
				};
			},
		});

		const rover = new SearchRover(client, discoveryRepo);
		const candidates = await rover.runSearchQuery("洛天依原创");

		expect(candidates).toHaveLength(1);
		expect(candidates[0].title).toBe("【洛天依原创】霜雪千年");

		const meta = await discoveryRepo.getMetadata(300001n);
		expect(meta).toBeDefined();
		expect(meta?.title).toBe("【洛天依原创】霜雪千年");
		expect(meta?.description).toBe("经典洛天依曲目");
		expect(meta?.pic).toBe("https://i0.hdslb.com/bfs/archive/pic.jpg");
		expect(meta?.duration).toBe(225); // 3*60 + 45 = 225
	});
});

describe("DiscoveryService", () => {
	test("enqueues new candidate videos into tracking while skipping existing ones", async () => {
		const discoveryRepo = new FakeDiscoveryRepository();
		const trackingRepo = new FakeTrackingRepository();

		// Pre-populate video 400001 in tracking repository
		await trackingRepo.upsertTracking({
			aid: 400001n,
			state: "regular",
			nextSnapshotAt: toInstant(new Date()),
		});

		const client = new BilibiliClient({
			request: async () => ({
				status: 200,
				headers: {},
				body: JSON.stringify({
					code: 0,
					message: "0",
					data: [
						{
							aid: 400001,
							bvid: "BV1400001",
							title: "Already Tracked Song",
							pic: "https://example.com/1.jpg",
							owner: { mid: 1, name: "A", face: "" },
							stat: {
								aid: 400001,
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
							aid: 400002,
							bvid: "BV1400002",
							title: "New Discovered Song",
							pic: "https://example.com/2.jpg",
							owner: { mid: 2, name: "B", face: "" },
							stat: {
								aid: 400002,
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
					],
				}),
			}),
		});

		const service = new DiscoveryService(client, discoveryRepo, trackingRepo);
		const result = await service.processVideoRecommendations(999999n);

		expect(result.relationsCount).toBe(2);
		expect(result.newTracked).toBe(1);

		// Video 400002 should now be in tracking
		const tracked400002 = await trackingRepo.getTracking(400002n);
		expect(tracked400002).toBeDefined();
		expect(tracked400002?.state).toBe("regular");
	});
});
