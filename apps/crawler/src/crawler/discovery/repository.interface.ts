import type { BilibiliVideoMetadata, BilibiliVideoRelation } from "@cvsa/snapshot-db";
import type { RelationEdge, UpsertMetadataInput } from "./types";

export interface IDiscoveryRepository {
	upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata>;
	bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void>;
	getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null>;
	getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]>;
	saveRelations(relations: RelationEdge[]): Promise<void>;
	getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]>;
	getIncomingRelations(targetAid: bigint, limit?: number): Promise<BilibiliVideoRelation[]>;
}
