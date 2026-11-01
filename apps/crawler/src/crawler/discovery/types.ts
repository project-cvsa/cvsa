import type { Temporal } from "@cvsa/snapshot-db";
import type { BilibiliRelatedVideo, SearchVideo } from "../bilibili";

export type CandidateSource = "related" | "search" | "topic" | "manual" | "hot_sample";

export type DiscoveryOriginChannel = "search" | "related" | "manual" | "graph";

export interface DiscoverySearchOrigin {
	keyword: string;
	order: string;
	page: number;
	position: number;
	categoryId?: number | null;
}

export interface DiscoveryRelatedOrigin {
	sourceAid: string;
	position: number;
}

export interface DiscoveryManualOrigin {
	action: "ingest" | "detail" | "seed";
}

export interface DiscoveryOrigin {
	channel: DiscoveryOriginChannel;
	capturedAt: string;
	search?: DiscoverySearchOrigin;
	related?: DiscoveryRelatedOrigin;
	manual?: DiscoveryManualOrigin;
}

export type DiscoveryDecisionOutcome = "accepted" | "rejected";
export type DiscoveryDecisionBasis = "whitelist" | "model" | "heuristic" | "rules";
export type DiscoveryDecisionReason =
	| "whitelist_match"
	| "model_accept"
	| "model_reject"
	| "model_unavailable"
	| "duration_out_of_range"
	| "blacklist_match";

export interface DiscoveryDecision {
	outcome: DiscoveryDecisionOutcome;
	basis: DiscoveryDecisionBasis;
	reason: DiscoveryDecisionReason;
	confidence: number;
	threshold?: number | null;
	sampled: boolean;
	rules?: {
		matchedSinger?: string;
		matchedIndicator?: string;
	};
	model?: {
		label: number;
		modelVersion: string;
		songProbability: number;
		probabilities: readonly number[];
	};
}

export interface DiscoveryContext {
	origin: DiscoveryOrigin;
	decision?: DiscoveryDecision;
	job?: {
		id: string;
		sweepId?: string;
	};
}

export interface UpsertDiscoverySampleInput {
	aid: bigint;
	bvid: string;
	title: string;
	description?: string | null;
	tags?: string[] | null;
	decision: "whitelist" | "model_accepted" | "model_rejected" | "manual_import";
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
	discoveryContext?: DiscoveryContext | null;
	capturedAt?: Temporal.Instant;
}

export interface DiscoveredCandidate {
	aid: bigint;
	bvid: string;
	title: string;
	source: CandidateSource;
	sourceAid?: bigint;
	position?: number;
	origin: DiscoveryOrigin;
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
	timeWindowDays?: number;
}

export interface SearchRoverConfig {
	keywords: string[];
	orders?: Array<"totalrank" | "click" | "pubdate" | "dm" | "stow">;
	pagesPerQuery?: number;
	timeWindowHours?: number;
	timeWindowDays?: number;
	mode?: "incremental" | "deep";
	concurrency?: number;
	from?: number | Date;
	to?: number | Date;
	categoryId?: number;
}

export interface ExtractionResult {
	sourceAid: bigint;
	relationsCount: number;
	candidates: DiscoveredCandidate[];
}
