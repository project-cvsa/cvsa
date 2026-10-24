import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { type Temporal, toInstant } from "@cvsa/snapshot-db";
import type { BilibiliRelatedVideo } from "../bilibili";
import type { IDiscoveryRepository } from "./repository.interface";
import type {
	DiscoveredCandidate,
	ExtractionResult,
	RelationEdge,
	UpsertMetadataInput,
} from "./types";

export class RelationExtractor {
	constructor(private readonly discoveryRepo: IDiscoveryRepository) {}

	async extractAndPersist(
		sourceAid: bigint,
		items: BilibiliRelatedVideo[],
		capturedAt: Temporal.Instant = toInstant(new Date())
	): Promise<ExtractionResult> {
		return traceTask("discovery.extractAndPersistRelations", async () => {
			if (!items || items.length === 0) {
				return { sourceAid, relationsCount: 0, candidates: [] };
			}

			const relations: RelationEdge[] = [];
			const metadatas: UpsertMetadataInput[] = [];
			const candidates: DiscoveredCandidate[] = [];

			for (let position = 0; position < items.length; position++) {
				const item = items[position];
				if (!item?.aid) continue;

				const targetAid = BigInt(item.aid);
				const pubdate = item.pubdate ? toInstant(new Date(item.pubdate * 1000)) : null;

				relations.push({
					sourceAid,
					targetAid,
					position,
					capturedAt,
				});

				metadatas.push({
					aid: targetAid,
					bvid: item.bvid,
					title: item.title,
					description: item.desc ?? null,
					pic: item.pic ?? null,
					pubdate,
					duration: item.duration ?? 0,
					mid: item.owner?.mid ? BigInt(item.owner.mid) : null,
					ownerName: item.owner?.name ?? null,
					ownerFace: item.owner?.face ?? null,
					tid: item.tid ?? null,
					tname: item.tname ?? null,
					copyright: item.copyright ?? null,
					rawPayload: item,
					capturedAt,
				});

				candidates.push({
					aid: targetAid,
					bvid: item.bvid,
					title: item.title,
					source: "related",
					sourceAid,
					position,
					pubdate,
					rawVideo: item,
				});
			}

			await Promise.all([
				this.discoveryRepo.saveRelations(relations),
				this.discoveryRepo.bulkUpsertMetadata(metadatas),
			]);

			appLogger.debug("Extracted related recommendations and saved graph edges", {
				component: "relation-extractor",
				sourceAid: sourceAid.toString(),
				edgesRecorded: relations.length,
			});

			return {
				sourceAid,
				relationsCount: relations.length,
				candidates,
			};
		});
	}
}
