import type { Temporal } from "@cvsa/snapshot-db";
import type { BilibiliRelatedVideo, SearchVideo } from "../bilibili";

export type CandidateSource = "related" | "search" | "topic" | "manual" | "hot_sample";

export interface UpsertDiscoverySampleInput {
	aid: bigint;
	bvid: string;
	title: string;
	description?: string | null;
	tags?: string[] | null;
	decision: "whitelist" | "model_accepted" | "model_rejected";
	modelVersion: string;
	probabilities: readonly number[];
	songProbability: number;
	humanLabel?: number | null;
	labeledAt?: Temporal.Instant | null;
	createdAt?: Temporal.Instant;
}

export interface HotSampleConfig {
	sampleCount?: number;
	cooldownHours?: number;
	maxRelationsPerSeed?: number;
	maxTotalCandidates?: number;
}

export interface RelationEdge {
	sourceAid: bigint;
	targetAid: bigint;
	position: number;
	capturedAt?: Temporal.Instant;
}

export interface UpsertMetadataInput {
	aid: bigint;
	bvid: string;
	cid?: bigint | null;
	videos?: number;
	tid?: number | null;
	tidV2?: number | null;
	tname?: string | null;
	tnameV2?: string | null;
	copyright?: number | null;
	pic?: string | null;
	title: string;
	pubdate?: Temporal.Instant | null;
	ctime?: Temporal.Instant | null;
	description?: string | null;
	descV2?: unknown | null;
	state?: number;
	duration?: number;
	Dynamic?: string | null;
	dimension?: unknown | null;
	mid?: bigint | null;
	ownerName?: string | null;
	ownerFace?: string | null;
	pages?: unknown | null;
	staff?: unknown | null;
	rights?: unknown | null;
	honorReply?: unknown | null;
	tags?: unknown | null;
	videoStatus?: string;
	filterDecision?: string;
	modelScore?: number | null;
	modelVersion?: string | null;
	discoverySource?: string | null;
	capturedAt?: Temporal.Instant;
}

export interface DiscoveredCandidate {
	aid: bigint;
	bvid: string;
	title: string;
	source: CandidateSource;
	sourceAid?: bigint;
	position?: number;
	pubdate?: Temporal.Instant | null;
	rawVideo?: BilibiliRelatedVideo | SearchVideo;
}

/**
 * The subset of `bilibili_video_metadata` that change history is computed over.
 * Everything else (cover URLs, counters) is descriptive noise for the archive.
 */
export interface MetadataComparable {
	title: string;
	description: string | null;
	pic: string | null;
	tid: number | null;
	tname: string | null;
	ownerName: string | null;
	duration: number;
	state: number;
	videoStatus: string;
	/** JSON columns; compared through their JSON projection, hence `unknown`. */
	tags: unknown;
	pages: unknown;
	staff: unknown;
}

export type MetadataChangeType = "created" | "updated" | "status_changed";

export interface MetadataFieldChange {
	old: unknown;
	new: unknown;
}

export type MetadataFieldDiff = Partial<Record<keyof MetadataComparable, MetadataFieldChange>>;

export type ListDiscoverySamplesOptions = Partial<
	import("@cvsa/contracts").DiscoverySampleListQuery
>;

export interface HotSampleOptions {
	limit: number;
	cooldownMinutes: number;
	now: Temporal.Instant;
}

export interface SearchRoverConfig {
	keywords: string[];
	orders?: Array<"totalrank" | "click" | "pubdate" | "dm" | "stow">;
	pagesPerQuery?: number;
	timeWindowHours?: number;
	categoryId?: number;
}

export interface ExtractionResult {
	sourceAid: bigint;
	relationsCount: number;
	candidates: DiscoveredCandidate[];
}
