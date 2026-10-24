import type {
	BilibiliVideoMetadata,
	BilibiliVideoRelation,
	DatabaseClient,
} from "@cvsa/snapshot-db";
import { toJson } from "@cvsa/snapshot-db";
import { traceTask } from "@cvsa/observability";
import type { IDiscoveryRepository } from "./repository.interface";
import type { RelationEdge, UpsertMetadataInput } from "./types";

export class DiscoveryRepository implements IDiscoveryRepository {
	constructor(private readonly db: DatabaseClient) {}

	async upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata> {
		return traceTask("discovery.upsertMetadata", async () => {
			const existing = await this.db.orm.public.BilibiliVideoMetadata.where({
				aid: data.aid,
			}).first();

			if (existing) {
				const updated = await this.db.orm.public.BilibiliVideoMetadata.where({
					aid: data.aid,
				}).update({
					bvid: data.bvid,
					title: data.title,
					description:
						data.description !== undefined ? data.description : existing.description,
					pic: data.pic !== undefined ? data.pic : existing.pic,
					pubdate: data.pubdate !== undefined ? data.pubdate : existing.pubdate,
					duration: data.duration ?? existing.duration,
					mid: data.mid !== undefined ? data.mid : existing.mid,
					ownerName: data.ownerName !== undefined ? data.ownerName : existing.ownerName,
					ownerFace: data.ownerFace !== undefined ? data.ownerFace : existing.ownerFace,
					tid: data.tid !== undefined ? data.tid : existing.tid,
					tname: data.tname !== undefined ? data.tname : existing.tname,
					copyright: data.copyright !== undefined ? data.copyright : existing.copyright,
					...(data.tags !== undefined ? { tags: toJson(data.tags) } : {}),
					...(data.rawPayload !== undefined
						? { rawPayload: toJson(data.rawPayload) }
						: {}),
				});
				if (updated) return updated;
			}

			return this.db.orm.public.BilibiliVideoMetadata.create({
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
				tags: data.tags ? toJson(data.tags) : null,
				rawPayload: data.rawPayload ? toJson(data.rawPayload) : null,
				...(data.capturedAt ? { capturedAt: data.capturedAt } : {}),
			});
		});
	}

	async bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void> {
		if (data.length === 0) return;
		await traceTask("discovery.bulkUpsertMetadata", async () => {
			await this.db.orm.public.BilibiliVideoMetadata.createAll(
				data.map((item) => ({
					aid: item.aid,
					bvid: item.bvid,
					title: item.title,
					description: item.description ?? null,
					pic: item.pic ?? null,
					pubdate: item.pubdate ?? null,
					duration: item.duration ?? 0,
					mid: item.mid ?? null,
					ownerName: item.ownerName ?? null,
					ownerFace: item.ownerFace ?? null,
					tid: item.tid ?? null,
					tname: item.tname ?? null,
					copyright: item.copyright ?? null,
					tags: item.tags ? toJson(item.tags) : null,
					rawPayload: item.rawPayload ? toJson(item.rawPayload) : null,
					...(item.capturedAt ? { capturedAt: item.capturedAt } : {}),
				})),
				{
					onConflict: "skip",
					conflictOn: ["aid"],
				}
			);
		});
	}

	async getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null> {
		return traceTask("discovery.getMetadata", () =>
			this.db.orm.public.BilibiliVideoMetadata.where({ aid }).first()
		);
	}

	async getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]> {
		if (aids.length === 0) return [];
		return traceTask("discovery.getMetadatas", () =>
			this.db.orm.public.BilibiliVideoMetadata.where((m) => m.aid.in(aids)).all()
		);
	}

	async saveRelations(relations: RelationEdge[]): Promise<void> {
		if (relations.length === 0) return;
		await traceTask("discovery.saveRelations", async () => {
			await this.db.orm.public.BilibiliVideoRelation.createAll(
				relations.map((rel) => ({
					sourceAid: rel.sourceAid,
					targetAid: rel.targetAid,
					position: rel.position,
					...(rel.capturedAt ? { capturedAt: rel.capturedAt } : {}),
				})),
				{
					onConflict: "skip",
					conflictOn: ["sourceAid", "targetAid", "capturedAt"],
				}
			);
		});
	}

	async getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]> {
		return traceTask("discovery.getRelationsBySource", () =>
			this.db.orm.public.BilibiliVideoRelation.where({ sourceAid })
				.orderBy((r) => r.position.asc())
				.all()
		);
	}

	async getIncomingRelations(targetAid: bigint, limit = 50): Promise<BilibiliVideoRelation[]> {
		return traceTask("discovery.getIncomingRelations", () =>
			this.db.orm.public.BilibiliVideoRelation.where({ targetAid })
				.orderBy((r) => r.capturedAt.desc())
				.limit(limit)
				.all()
		);
	}
}
