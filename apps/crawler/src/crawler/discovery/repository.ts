import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	like,
	lte,
	notInArray,
	or,
	type SQL,
} from "drizzle-orm";
import { activeTaskResource } from "../shared/taskContext";
import type {
	BilibiliVideoMetadata,
	BilibiliVideoMetadataHistory,
	BilibiliVideoRelation,
	DatabaseClient,
	DiscoverySample,
} from "@cvsa/snapshot-db";
import {
	bilibiliVideoMetadata,
	bilibiliVideoMetadataHistory,
	bilibiliVideoRelation,
	crawlerRuntimeConfig,
	discoverySample,
	toInstant,
	toJson,
	videoTracking,
} from "@cvsa/snapshot-db";
import { DiscoveryContextSchema } from "@cvsa/contracts";
import { traceTask } from "@cvsa/observability";
import type { IDiscoveryRepository } from "./repository.interface";
import type {
	DiscoveryContext,
	HotSampleOptions,
	ListDiscoverySamplesOptions,
	MetadataChangeType,
	MetadataComparable,
	MetadataFieldDiff,
	RelationEdge,
	UpsertDiscoverySampleInput,
	UpsertMetadataInput,
} from "./types";

/** Fields whose change is worth a history row. */
const TRACKED_FIELDS: readonly (keyof MetadataComparable)[] = [
	"title",
	"description",
	"pic",
	"tid",
	"tname",
	"ownerName",
	"duration",
	"state",
	"videoStatus",
	"tags",
	"pages",
	"staff",
];

function stableJson(value: unknown): string {
	return JSON.stringify(toJson(value) ?? null);
}

function parseDiscoveryContext(value: unknown): DiscoveryContext | null {
	const parsed = DiscoveryContextSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

/**
 * Provenance is first-write-wins; the decision snapshot follows the latest
 * evaluation. A metadata refresh therefore cannot rewrite where a video came
 * from, while a re-evaluation can still update its classifier outcome.
 */
function mergeDiscoveryContext(
	existing: unknown,
	incoming: DiscoveryContext | null | undefined
): DiscoveryContext | null {
	const current = parseDiscoveryContext(existing);
	if (!incoming) return current;
	if (!current) return incoming;
	return {
		origin: current.origin,
		...((incoming.decision ?? current.decision)
			? { decision: incoming.decision ?? current.decision }
			: {}),
		...((incoming.job ?? current.job) ? { job: incoming.job ?? current.job } : {}),
	};
}

function comparableFromRow(row: BilibiliVideoMetadata): MetadataComparable {
	return {
		title: row.title,
		description: row.description,
		pic: row.pic,
		tid: row.tid,
		tname: row.tname,
		ownerName: row.ownerName,
		duration: row.duration,
		state: row.state,
		videoStatus: row.videoStatus,
		tags: row.tags,
		pages: row.pages,
		staff: row.staff,
	};
}

function comparableFromInput(
	row: BilibiliVideoMetadata,
	data: UpsertMetadataInput
): MetadataComparable {
	return {
		title: data.title,
		description: data.description !== undefined ? data.description : row.description,
		pic: data.pic !== undefined ? data.pic : row.pic,
		tid: data.tid !== undefined ? data.tid : row.tid,
		tname: data.tname !== undefined ? data.tname : row.tname,
		ownerName: data.ownerName !== undefined ? data.ownerName : row.ownerName,
		duration: data.duration ?? row.duration,
		state: data.state ?? row.state,
		videoStatus: data.videoStatus ?? row.videoStatus,
		tags: data.tags !== undefined ? toJson(data.tags) : row.tags,
		pages: data.pages !== undefined ? toJson(data.pages) : row.pages,
		staff: data.staff !== undefined ? toJson(data.staff) : row.staff,
	};
}

/**
 * Field-level diff between the stored row and the incoming payload.
 *
 * Values are compared through their JSON projection so arrays/objects (tags,
 * pages, staff) compare by value instead of by reference.
 */
export function diffMetadata(
	existing: BilibiliVideoMetadata,
	data: UpsertMetadataInput
): MetadataFieldDiff {
	const before = comparableFromRow(existing);
	const after = comparableFromInput(existing, data);
	const diff: MetadataFieldDiff = {};

	for (const field of TRACKED_FIELDS) {
		if (stableJson(before[field]) === stableJson(after[field])) continue;
		diff[field] = { old: before[field], new: after[field] };
	}

	return diff;
}

/** `status_changed` wins over `updated` when availability/takedown flags moved. */
export function changeTypeForDiff(diff: MetadataFieldDiff): MetadataChangeType | undefined {
	const fields = Object.keys(diff);
	if (fields.length === 0) return undefined;
	if (diff.state !== undefined || diff.videoStatus !== undefined) return "status_changed";
	return "updated";
}

const AID = bilibiliVideoMetadata.aid;

export class DiscoveryRepository implements IDiscoveryRepository {
	constructor(private readonly db: DatabaseClient) {}

	async upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata> {
		return traceTask("discovery.upsertMetadata", async () => {
			const db = activeTaskResource(this.db);
			const [existing] = await db
				.select()
				.from(bilibiliVideoMetadata)
				.where(eq(AID, data.aid))
				.limit(1);

			if (existing) {
				const diff = diffMetadata(existing, data);
				const changeType = changeTypeForDiff(diff);
				const discoveryContext = data.discoveryContext
					? mergeDiscoveryContext(existing.discoveryContext, data.discoveryContext)
					: undefined;

				const [updated] = await db
					.update(bilibiliVideoMetadata)
					.set({
						bvid: data.bvid,
						cid: data.cid !== undefined ? data.cid : existing.cid,
						videos: data.videos ?? existing.videos,
						tid: data.tid !== undefined ? data.tid : existing.tid,
						tidV2: data.tidV2 !== undefined ? data.tidV2 : existing.tidV2,
						tname: data.tname !== undefined ? data.tname : existing.tname,
						tnameV2: data.tnameV2 !== undefined ? data.tnameV2 : existing.tnameV2,
						copyright:
							data.copyright !== undefined ? data.copyright : existing.copyright,
						pic: data.pic !== undefined ? data.pic : existing.pic,
						title: data.title,
						pubdate: data.pubdate !== undefined ? data.pubdate : existing.pubdate,
						ctime: data.ctime !== undefined ? data.ctime : existing.ctime,
						description:
							data.description !== undefined
								? data.description
								: existing.description,
						...(data.descV2 !== undefined ? { descV2: toJson(data.descV2) } : {}),
						state: data.state ?? existing.state,
						duration: data.duration ?? existing.duration,
						Dynamic: data.Dynamic !== undefined ? data.Dynamic : existing.Dynamic,
						...(data.dimension !== undefined
							? { dimension: toJson(data.dimension) }
							: {}),
						mid: data.mid !== undefined ? data.mid : existing.mid,
						ownerName:
							data.ownerName !== undefined ? data.ownerName : existing.ownerName,
						ownerFace:
							data.ownerFace !== undefined ? data.ownerFace : existing.ownerFace,
						...(data.pages !== undefined ? { pages: toJson(data.pages) } : {}),
						...(data.staff !== undefined ? { staff: toJson(data.staff) } : {}),
						...(data.rights !== undefined ? { rights: toJson(data.rights) } : {}),
						...(data.honorReply !== undefined
							? { honorReply: toJson(data.honorReply) }
							: {}),
						...(data.tags !== undefined ? { tags: toJson(data.tags) } : {}),
						videoStatus: data.videoStatus ?? existing.videoStatus,
						filterDecision: data.filterDecision ?? existing.filterDecision,
						modelScore:
							data.modelScore !== undefined ? data.modelScore : existing.modelScore,
						modelVersion:
							data.modelVersion !== undefined
								? data.modelVersion
								: existing.modelVersion,
						// Provenance is first-write-wins: later evaluations and metadata
						// refreshes must not rewrite where the video was discovered.
						discoverySource: existing.discoverySource ?? data.discoverySource ?? null,
						...(discoveryContext !== undefined
							? {
									discoveryContext: discoveryContext
										? toJson(discoveryContext)
										: null,
								}
							: {}),
					})
					.where(eq(AID, data.aid))
					.returning();

				if (updated) {
					if (changeType) {
						await this.appendMetadataHistory(updated, changeType, diff);
					}
					return updated;
				}
				return existing;
			}

			const [created] = await db
				.insert(bilibiliVideoMetadata)
				.values({
					aid: data.aid,
					bvid: data.bvid,
					cid: data.cid ?? null,
					videos: data.videos ?? 1,
					tid: data.tid ?? null,
					tidV2: data.tidV2 ?? null,
					tname: data.tname ?? null,
					tnameV2: data.tnameV2 ?? null,
					copyright: data.copyright ?? null,
					pic: data.pic ?? null,
					title: data.title,
					pubdate: data.pubdate ?? null,
					ctime: data.ctime ?? null,
					description: data.description ?? null,
					descV2: data.descV2 !== undefined ? toJson(data.descV2) : null,
					state: data.state ?? 0,
					duration: data.duration ?? 0,
					Dynamic: data.Dynamic ?? null,
					dimension: data.dimension !== undefined ? toJson(data.dimension) : null,
					mid: data.mid ?? null,
					ownerName: data.ownerName ?? null,
					ownerFace: data.ownerFace ?? null,
					pages: data.pages !== undefined ? toJson(data.pages) : null,
					staff: data.staff !== undefined ? toJson(data.staff) : null,
					rights: data.rights !== undefined ? toJson(data.rights) : null,
					honorReply: data.honorReply !== undefined ? toJson(data.honorReply) : null,
					tags: data.tags !== undefined ? toJson(data.tags) : null,
					videoStatus: data.videoStatus ?? "normal",
					filterDecision: data.filterDecision ?? "accepted",
					modelScore: data.modelScore ?? null,
					modelVersion: data.modelVersion ?? null,
					discoverySource: data.discoverySource ?? null,
					discoveryContext: data.discoveryContext ? toJson(data.discoveryContext) : null,
					...(data.capturedAt ? { capturedAt: data.capturedAt } : {}),
				})
				.returning();

			if (!created) throw new Error(`Failed to insert metadata for aid=${data.aid}`);
			await this.appendMetadataHistory(created, "created", {});
			return created;
		});
	}

	/**
	 * Persist a bulk of (typically shallow) metadata rows.
	 *
	 * Only rows that do not exist yet are inserted: recommendation and search
	 * payloads are far less complete than a detail fetch, so overwriting an
	 * existing row with them would drop `pages`/`staff`/`rights`/`tags` and reset
	 * `videoStatus`. Existing rows are refreshed through {@link upsertMetadata}.
	 */
	async bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void> {
		if (data.length === 0) return;
		await traceTask("discovery.bulkUpsertMetadata", async () => {
			const unique = new Map<bigint, UpsertMetadataInput>();
			for (const item of data) {
				if (!unique.has(item.aid)) unique.set(item.aid, item);
			}

			const db = activeTaskResource(this.db);
			const existingRows = await db
				.select({ aid: AID })
				.from(bilibiliVideoMetadata)
				.where(inArray(AID, [...unique.keys()]));
			const existingAids = new Set(existingRows.map((row) => row.aid));
			const missing = [...unique.values()].filter((item) => !existingAids.has(item.aid));
			if (missing.length === 0) return;

			await db
				.insert(bilibiliVideoMetadata)
				.values(
					missing.map((item) => ({
						aid: item.aid,
						bvid: item.bvid,
						cid: item.cid ?? null,
						videos: item.videos ?? 1,
						tid: item.tid ?? null,
						tidV2: item.tidV2 ?? null,
						tname: item.tname ?? null,
						tnameV2: item.tnameV2 ?? null,
						copyright: item.copyright ?? null,
						pic: item.pic ?? null,
						title: item.title,
						pubdate: item.pubdate ?? null,
						ctime: item.ctime ?? null,
						description: item.description ?? null,
						descV2: item.descV2 !== undefined ? toJson(item.descV2) : null,
						state: item.state ?? 0,
						duration: item.duration ?? 0,
						Dynamic: item.Dynamic ?? null,
						dimension: item.dimension !== undefined ? toJson(item.dimension) : null,
						mid: item.mid ?? null,
						ownerName: item.ownerName ?? null,
						ownerFace: item.ownerFace ?? null,
						pages: item.pages !== undefined ? toJson(item.pages) : null,
						staff: item.staff !== undefined ? toJson(item.staff) : null,
						rights: item.rights !== undefined ? toJson(item.rights) : null,
						honorReply: item.honorReply !== undefined ? toJson(item.honorReply) : null,
						tags: item.tags !== undefined ? toJson(item.tags) : null,
						videoStatus: item.videoStatus ?? "normal",
						filterDecision: item.filterDecision ?? "accepted",
						modelScore: item.modelScore ?? null,
						modelVersion: item.modelVersion ?? null,
						discoverySource: item.discoverySource ?? null,
						discoveryContext: item.discoveryContext
							? toJson(item.discoveryContext)
							: null,
						...(item.capturedAt ? { capturedAt: item.capturedAt } : {}),
					}))
				)
				.onConflictDoNothing({ target: [AID] });
		});
	}

	async deleteMetadata(aid: bigint): Promise<void> {
		await traceTask("discovery.deleteMetadata", async () => {
			await activeTaskResource(this.db).delete(bilibiliVideoMetadata).where(eq(AID, aid));
		});
	}

	async getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null> {
		return traceTask("discovery.getMetadata", async () => {
			const [row] = await activeTaskResource(this.db)
				.select()
				.from(bilibiliVideoMetadata)
				.where(eq(AID, aid))
				.limit(1);
			return row ?? null;
		});
	}

	async getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]> {
		if (aids.length === 0) return [];
		return traceTask("discovery.getMetadatas", () =>
			activeTaskResource(this.db)
				.select()
				.from(bilibiliVideoMetadata)
				.where(inArray(AID, aids))
		);
	}

	async getMetadataHistory(aid: bigint, limit = 100): Promise<BilibiliVideoMetadataHistory[]> {
		return traceTask("discovery.getMetadataHistory", () =>
			activeTaskResource(this.db)
				.select()
				.from(bilibiliVideoMetadataHistory)
				.where(eq(bilibiliVideoMetadataHistory.aid, aid))
				.orderBy(desc(bilibiliVideoMetadataHistory.capturedAt))
				.limit(Math.min(Math.max(limit, 1), 500))
		);
	}

	async saveRelations(relations: RelationEdge[]): Promise<void> {
		if (relations.length === 0) return;
		await traceTask("discovery.saveRelations", async () => {
			await activeTaskResource(this.db)
				.insert(bilibiliVideoRelation)
				.values(
					relations.map((rel) => ({
						sourceAid: rel.sourceAid,
						targetAid: rel.targetAid,
						position: rel.position,
						...(rel.capturedAt ? { capturedAt: rel.capturedAt } : {}),
					}))
				)
				.onConflictDoNothing({
					target: [
						bilibiliVideoRelation.sourceAid,
						bilibiliVideoRelation.targetAid,
						bilibiliVideoRelation.capturedAt,
					],
				});
		});
	}

	async getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]> {
		return traceTask("discovery.getRelationsBySource", () =>
			activeTaskResource(this.db)
				.select()
				.from(bilibiliVideoRelation)
				.where(eq(bilibiliVideoRelation.sourceAid, sourceAid))
				.orderBy(asc(bilibiliVideoRelation.position))
		);
	}

	async getIncomingRelations(targetAid: bigint, limit = 50): Promise<BilibiliVideoRelation[]> {
		return traceTask("discovery.getIncomingRelations", () =>
			activeTaskResource(this.db)
				.select()
				.from(bilibiliVideoRelation)
				.where(eq(bilibiliVideoRelation.targetAid, targetAid))
				.orderBy(desc(bilibiliVideoRelation.capturedAt))
				.limit(limit)
		);
	}

	/**
	 * Seeds the next recommendation expansion round: the fastest-moving tracked
	 * videos whose recommendations were not collected within `cooldownMinutes`.
	 */
	async listHotSampleCandidates(options: HotSampleOptions): Promise<bigint[]> {
		return traceTask("discovery.listHotSampleCandidates", async () => {
			const cooldownCutoff = toInstant(
				new Date(options.now.epochMilliseconds - options.cooldownMinutes * 60_000)
			);
			const limit = Math.min(Math.max(options.limit, 1), 100);
			const db = activeTaskResource(this.db);

			const recentSources = await db
				.select({ sourceAid: bilibiliVideoRelation.sourceAid })
				.from(bilibiliVideoRelation)
				.where(gte(bilibiliVideoRelation.capturedAt, cooldownCutoff))
				.limit(2_000);
			const recentlySampled = [...new Set(recentSources.map((r) => r.sourceAid))];

			const rows = await db
				.select({ aid: videoTracking.aid })
				.from(videoTracking)
				.where(
					recentlySampled.length > 0
						? and(
								gt(videoTracking.velocity, 0),
								notInArray(videoTracking.aid, recentlySampled)
							)
						: gt(videoTracking.velocity, 0)
				)
				.orderBy(desc(videoTracking.velocity))
				.limit(limit);
			return rows.map((row) => row.aid);
		});
	}

	async upsertSample(sample: UpsertDiscoverySampleInput): Promise<DiscoverySample> {
		return traceTask("discovery.upsertSample", async () => {
			const db = activeTaskResource(this.db);
			const [existing] = await db
				.select()
				.from(discoverySample)
				.where(eq(discoverySample.aid, sample.aid))
				.limit(1);

			if (existing) {
				const [updated] = await db
					.update(discoverySample)
					.set({
						bvid: sample.bvid,
						title: sample.title,
						description: sample.description ?? existing.description,
						...(sample.tags !== undefined ? { tags: toJson(sample.tags) } : {}),
						decision: sample.decision,
						modelVersion: sample.modelVersion,
						probabilities: toJson(sample.probabilities),
						songProbability: sample.songProbability,
						...(sample.humanLabel !== undefined
							? { humanLabel: sample.humanLabel }
							: {}),
						...(sample.labeledAt !== undefined ? { labeledAt: sample.labeledAt } : {}),
					})
					.where(eq(discoverySample.aid, sample.aid))
					.returning();
				return updated ?? existing;
			}

			const [created] = await db
				.insert(discoverySample)
				.values({
					aid: sample.aid,
					bvid: sample.bvid,
					title: sample.title,
					description: sample.description ?? null,
					tags: sample.tags !== undefined ? toJson(sample.tags) : null,
					decision: sample.decision,
					modelVersion: sample.modelVersion,
					probabilities: toJson(sample.probabilities),
					songProbability: sample.songProbability,
					humanLabel: sample.humanLabel ?? null,
					labeledAt: sample.labeledAt ?? null,
					...(sample.createdAt ? { createdAt: sample.createdAt } : {}),
				})
				.returning();
			if (!created)
				throw new Error(`Failed to insert discovery sample for aid=${sample.aid}`);
			return created;
		});
	}

	/** WHERE clause shared by {@link listSamples} and {@link countSamples}. */
	private async sampleWhere(options: ListDiscoverySamplesOptions = {}): Promise<SQL | undefined> {
		const search = options.search?.trim();
		const exactAid =
			search && /^(?:av)?\d+$/i.test(search) ? BigInt(search.replace(/^av/i, "")) : undefined;
		const sourceRows = options.source
			? await activeTaskResource(this.db)
					.select({ aid: AID })
					.from(bilibiliVideoMetadata)
					.where(eq(bilibiliVideoMetadata.discoverySource, options.source))
			: undefined;

		const conditions: SQL[] = [gte(discoverySample.aid, 0n)];
		if (options.decision) conditions.push(eq(discoverySample.decision, options.decision));
		if (options.labeled === true) conditions.push(isNotNull(discoverySample.humanLabel));
		if (options.labeled === false) conditions.push(isNull(discoverySample.humanLabel));
		if (options.minConfidence !== undefined)
			conditions.push(gte(discoverySample.songProbability, options.minConfidence));
		if (options.maxConfidence !== undefined)
			conditions.push(lte(discoverySample.songProbability, options.maxConfidence));
		if (exactAid !== undefined) conditions.push(eq(discoverySample.aid, exactAid));
		else if (search) {
			const searchCondition = or(
				eq(discoverySample.bvid, search),
				like(discoverySample.title, `%${search.replace(/[\\%_]/g, "\\$&")}%`)
			);
			if (searchCondition) conditions.push(searchCondition);
		}
		if (sourceRows)
			conditions.push(
				inArray(
					discoverySample.aid,
					sourceRows.map((m) => m.aid)
				)
			);

		return and(...conditions);
	}

	async listSamples(options: ListDiscoverySamplesOptions = {}): Promise<DiscoverySample[]> {
		return traceTask("discovery.listSamples", async () => {
			const where = await this.sampleWhere(options);
			const ascending = options.sortOrder === "asc";
			const direction = ascending ? asc : desc;
			const order =
				options.sortBy === "confidence"
					? [direction(discoverySample.songProbability), desc(discoverySample.aid)]
					: options.sortBy === "aid"
						? [direction(discoverySample.aid)]
						: [direction(discoverySample.createdAt), desc(discoverySample.aid)];

			return activeTaskResource(this.db)
				.select()
				.from(discoverySample)
				.where(where)
				.orderBy(...order)
				.limit(Math.min(Math.max(options.limit ?? 50, 1), 200))
				.offset(options.offset ?? 0);
		});
	}

	async countSamples(options: ListDiscoverySamplesOptions = {}): Promise<number> {
		const where = await this.sampleWhere(options);
		const [totals] = await activeTaskResource(this.db)
			.select({ total: count() })
			.from(discoverySample)
			.where(where);
		return totals?.total ?? 0;
	}

	async getSample(aid: bigint): Promise<DiscoverySample | null> {
		return traceTask("discovery.getSample", async () => {
			const [row] = await activeTaskResource(this.db)
				.select()
				.from(discoverySample)
				.where(eq(discoverySample.aid, aid))
				.limit(1);
			return row ?? null;
		});
	}

	async labelSample(aid: bigint, humanLabel: number): Promise<DiscoverySample | null> {
		return traceTask("discovery.labelSample", async () => {
			const [row] = await activeTaskResource(this.db)
				.update(discoverySample)
				.set({ humanLabel, labeledAt: toInstant(new Date()) })
				.where(eq(discoverySample.aid, aid))
				.returning();
			return row ?? null;
		});
	}

	async getRuntimeConfig(key: string): Promise<{ revision: number; config: unknown } | null> {
		return traceTask("discovery.getRuntimeConfig", async () => {
			const [row] = await activeTaskResource(this.db)
				.select()
				.from(crawlerRuntimeConfig)
				.where(eq(crawlerRuntimeConfig.key, key))
				.limit(1);
			if (!row) return null;
			return { revision: row.revision, config: row.config };
		});
	}

	async saveRuntimeConfig(
		key: string,
		config: unknown,
		expectedRevision?: number
	): Promise<{ revision: number; config: unknown }> {
		return traceTask("discovery.saveRuntimeConfig", async () => {
			const db = activeTaskResource(this.db);
			const [existing] = await db
				.select()
				.from(crawlerRuntimeConfig)
				.where(eq(crawlerRuntimeConfig.key, key))
				.limit(1);
			if (existing) {
				if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
					throw new Error(
						`Configuration revision conflict for key=${key}: expected ${expectedRevision}, got ${existing.revision}`
					);
				}
				const nextRevision = existing.revision + 1;
				const [updated] = await db
					.update(crawlerRuntimeConfig)
					.set({
						revision: nextRevision,
						config: toJson(config),
					})
					.where(eq(crawlerRuntimeConfig.key, key))
					.returning();
				return {
					revision: updated?.revision ?? nextRevision,
					config: updated?.config ?? config,
				};
			}

			const [created] = await db
				.insert(crawlerRuntimeConfig)
				.values({
					key,
					revision: 1,
					config: toJson(config),
				})
				.returning();
			if (!created) throw new Error(`Failed to create runtime config for key=${key}`);
			return { revision: created.revision, config: created.config };
		});
	}

	private async appendMetadataHistory(
		row: BilibiliVideoMetadata,
		changeType: MetadataChangeType,
		changedFields: MetadataFieldDiff
	): Promise<void> {
		await traceTask("discovery.appendMetadataHistory", async () => {
			await activeTaskResource(this.db)
				.insert(bilibiliVideoMetadataHistory)
				.values({
					aid: row.aid,
					capturedAt: toInstant(new Date()),
					changeType,
					changedFields: toJson(changedFields),
					snapshot: toJson(row),
				});
		});
	}
}
