import type {
	BilibiliVideoMetadata,
	BilibiliVideoMetadataHistory,
	BilibiliVideoRelation,
	DiscoverySample,
	Temporal,
} from "@cvsa/snapshot-db";
import type {
	HotSampleOptions,
	ListDiscoverySamplesOptions,
	RelationEdge,
	UpsertDiscoverySampleInput,
	UpsertMetadataInput,
} from "./types";

export interface VideoMetadataSummary {
	aid: bigint;
	bvid: string;
	title: string;
	pic: string | null;
	ownerName: string | null;
	duration: number;
	videoStatus: string;
	filterDecision: string;
	discoverySource: string | null;
	discoveryContext: unknown;
}

export interface MetadataHistoryListItem {
	id: bigint;
	aid: bigint;
	capturedAt: Temporal.Instant;
	changeType: string;
	changedFields: unknown;
}

export interface IDiscoveryRepository {
	upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata>;
	upsertMetadataWithResult(data: UpsertMetadataInput): Promise<{
		row: BilibiliVideoMetadata;
		change: "inserted" | "changed" | "unchanged";
	}>;
	/**
	 * Insert-only bulk write for shallow (search/recommendation) payloads.
	 * Existing rows are never overwritten, so richer detail metadata survives.
	 */
	bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void>;
	deleteMetadata(aid: bigint): Promise<void>;
	getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null>;
	getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]>;
	getMetadataSummaries(aids: bigint[]): Promise<VideoMetadataSummary[]>;
	getMetadataHistory(aid: bigint, limit?: number): Promise<BilibiliVideoMetadataHistory[]>;
	listMetadataHistory(
		aid: bigint,
		options: { limit: number; offset: number }
	): Promise<{ items: MetadataHistoryListItem[]; total: number }>;
	saveRelations(relations: RelationEdge[]): Promise<void>;
	getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]>;
	getIncomingRelations(targetAid: bigint, limit?: number): Promise<BilibiliVideoRelation[]>;
	/** Fastest tracked videos whose recommendations were not sampled recently. */
	listHotSampleCandidates(options: HotSampleOptions): Promise<bigint[]>;
	upsertSample(sample: UpsertDiscoverySampleInput): Promise<DiscoverySample>;
	listSamples(options?: ListDiscoverySamplesOptions): Promise<DiscoverySample[]>;
	countSamples(options?: ListDiscoverySamplesOptions): Promise<number>;
	getSample(aid: bigint): Promise<DiscoverySample | null>;
	labelSample(aid: bigint, humanLabel: number): Promise<DiscoverySample | null>;
	getRuntimeConfig(key: string): Promise<{ revision: number; config: unknown } | null>;
	saveRuntimeConfig(
		key: string,
		config: unknown,
		expectedRevision?: number
	): Promise<{ revision: number; config: unknown }>;
	markSearchWindowsExplored(windows: { keyword: string; windowStart: number }[]): Promise<void>;
	getExploredSearchWindows(
		keyword: string,
		fromWindow: number,
		toWindow: number
	): Promise<Set<number>>;
}
