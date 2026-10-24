import type { Temporal } from "@cvsa/snapshot-db";
import type { BilibiliRelatedVideo, SearchVideo } from "../bilibili";

export type CandidateSource = "related" | "search" | "topic" | "manual";

export interface RelationEdge {
	sourceAid: bigint;
	targetAid: bigint;
	position: number;
	capturedAt?: Temporal.Instant;
}

export interface UpsertMetadataInput {
	aid: bigint;
	bvid: string;
	title: string;
	description?: string | null;
	pic?: string | null;
	pubdate?: Temporal.Instant | null;
	duration?: number;
	mid?: bigint | null;
	ownerName?: string | null;
	ownerFace?: string | null;
	tid?: number | null;
	tname?: string | null;
	copyright?: number | null;
	tags?: unknown | null;
	rawPayload?: unknown | null;
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
