import type {
	BilibiliVideoMetadata,
	BilibiliVideoMetadataHistory,
	BilibiliVideoRelation,
	DiscoverySample,
} from "@cvsa/snapshot-db";
import type {
	HotSampleOptions,
	ListDiscoverySamplesOptions,
	RelationEdge,
	UpsertDiscoverySampleInput,
	UpsertMetadataInput,
} from "./types";

export interface IDiscoveryRepository {
	upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata>;
	/**
	 * Insert-only bulk write for shallow (search/recommendation) payloads.
	 * Existing rows are never overwritten, so richer detail metadata survives.
	 */
	bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void>;
	getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null>;
	getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]>;
	getMetadataHistory(aid: bigint, limit?: number): Promise<BilibiliVideoMetadataHistory[]>;
	saveRelations(relations: RelationEdge[]): Promise<void>;
	getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]>;
	getIncomingRelations(targetAid: bigint, limit?: number): Promise<BilibiliVideoRelation[]>;
	/** Fastest tracked videos whose recommendations were not sampled recently. */
	listHotSampleCandidates(options: HotSampleOptions): Promise<bigint[]>;
	upsertSample(sample: UpsertDiscoverySampleInput): Promise<DiscoverySample>;
	listSamples(options?: ListDiscoverySamplesOptions): Promise<DiscoverySample[]>;
	labelSample(aid: bigint, humanLabel: number): Promise<DiscoverySample | null>;
	getRuntimeConfig(key: string): Promise<{ revision: number; config: unknown } | null>;
	saveRuntimeConfig(
		key: string,
		config: unknown,
		expectedRevision?: number
	): Promise<{ revision: number; config: unknown }>;
}
