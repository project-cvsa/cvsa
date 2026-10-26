import { z } from "zod";
import { NetworkRuntimeConfigSchema } from "@cvsa/network-scheduler";

/**
 * Control-plane DTOs for the crawler network runtime.
 *
 * `@cvsa/network-scheduler` owns the routing configuration itself (adapters,
 * bindings, policies, health). What lives here is everything that only exists
 * because the crawler persists and exposes that configuration: the stored
 * document, the optimistic-concurrency replacement request, and the runtime
 * status the control-plane API answers with.
 */

export const NetworkRuntimeConfigDocumentSchema = z.object({
	revision: z.number().int().positive(),
	config: NetworkRuntimeConfigSchema,
	updatedAt: z.coerce.date(),
});

export const ReplaceNetworkRuntimeConfigRequestSchema = z.object({
	revision: z.number().int().nonnegative(),
	config: NetworkRuntimeConfigSchema,
});

/** Mirrors `NetworkAdapterRuntimeStatus` from the scheduler's contracts. */
export const NetworkAdapterRuntimeStatusSchema = z.object({
	id: z.string(),
	enabled: z.boolean(),
	healthState: z.enum(["healthy", "degraded", "open", "half-open"]),
	healthFactor: z.number(),
	effectiveWeight: z.number(),
	consecutiveFailures: z.number().int().nonnegative(),
	openUntil: z.number().int().nullable(),
});

export const NetworkRuntimeStatusSchema = z.object({
	ready: z.boolean(),
	revision: z.number().int().positive().nullable(),
	adapters: z.array(NetworkAdapterRuntimeStatusSchema),
});

export const VideoTrackingDtoSchema = z.object({
	aid: z.string(),
	state: z.string(),
	nextSnapshotAt: z.string(),
	lastViews: z.number().int(),
	lastCapturedAt: z.string().nullable(),
	velocity: z.number(),
	targetMilestone: z.number().int().nullable(),
	etaHours: z.number().nullable(),
	publishedAt: z.string().nullable(),
	priority: z.number().int(),
	consecutiveFails: z.number().int(),
	updatedAt: z.string(),
});

export const RegisterTrackingVideosRequestSchema = z.object({
	aids: z
		.array(z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]))
		.min(1)
		.max(1000),
	state: z.enum(["new", "regular", "milestone", "archive"]).optional(),
	priority: z.number().int().min(1).max(5).optional(),
});

export const RegisterTrackingVideosResponseSchema = z.object({
	registered: z.number().int().nonnegative(),
});

export const PromoteTrackingVideoRequestSchema = z.object({
	targetMilestone: z.number().int().positive().optional(),
	priority: z.number().int().min(1).max(5).optional(),
});

export type NetworkRuntimeConfigDocument = z.infer<typeof NetworkRuntimeConfigDocumentSchema>;
export type ReplaceNetworkRuntimeConfigRequest = z.infer<
	typeof ReplaceNetworkRuntimeConfigRequestSchema
>;
export type NetworkAdapterRuntimeStatusDto = z.infer<typeof NetworkAdapterRuntimeStatusSchema>;
export type NetworkRuntimeStatus = z.infer<typeof NetworkRuntimeStatusSchema>;
export type VideoTrackingDto = z.infer<typeof VideoTrackingDtoSchema>;
export type RegisterTrackingVideosRequest = z.infer<typeof RegisterTrackingVideosRequestSchema>;
export type RegisterTrackingVideosResponse = z.infer<typeof RegisterTrackingVideosResponseSchema>;
export type PromoteTrackingVideoRequest = z.infer<typeof PromoteTrackingVideoRequestSchema>;

export const DiscoverySweepRequestSchema = z.object({
	keywords: z.array(z.string().min(1)).min(1).max(50).optional(),
	orders: z
		.array(z.enum(["totalrank", "click", "pubdate", "dm", "stow"]))
		.min(1)
		.max(5)
		.optional(),
	pagesPerQuery: z.number().int().min(1).max(10).optional(),
	categoryId: z.number().int().positive().optional(),
});

export const DiscoverySweepResponseSchema = z.object({
	totalDiscovered: z.number().int().nonnegative(),
	newTracked: z.number().int().nonnegative(),
});

export const ProcessRecommendationsResponseSchema = z.object({
	sourceAid: z.string(),
	relationsCount: z.number().int().nonnegative(),
	newTracked: z.number().int().nonnegative(),
});

export const BilibiliVideoMetadataDtoSchema = z.object({
	aid: z.string(),
	bvid: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	pic: z.string().nullable(),
	pubdate: z.string().nullable(),
	duration: z.number().int(),
	mid: z.string().nullable(),
	ownerName: z.string().nullable(),
	ownerFace: z.string().nullable(),
	tid: z.number().int().nullable(),
	tname: z.string().nullable(),
	copyright: z.number().int().nullable(),
	/** First-page CID, as a decimal string (BigInt on the wire). */
	cid: z.string().nullable().optional(),
	/** Number of parts on a multi-part video. */
	videos: z.number().int().optional(),
	tidV2: z.number().int().nullable().optional(),
	tnameV2: z.string().nullable().optional(),
	/** Creation time, ISO-8601. */
	ctime: z.string().nullable().optional(),
	/** Structured description blocks (`desc_v2`). */
	descV2: z.unknown().nullable().optional(),
	state: z.number().int().optional(),
	/** Bilibili's `dynamic` blurb. */
	dynamic: z.string().nullable().optional(),
	dimension: z.unknown().nullable().optional(),
	pages: z.unknown().nullable().optional(),
	staff: z.unknown().nullable().optional(),
	rights: z.unknown().nullable().optional(),
	honorReply: z.unknown().nullable().optional(),
	tags: z.unknown().nullable(),
	videoStatus: z.string().optional(),
	filterDecision: z.string().optional(),
	modelScore: z.number().nullable().optional(),
	modelVersion: z.string().nullable().optional(),
	discoverySource: z.string().nullable().optional(),
	capturedAt: z.string(),
	updatedAt: z.string(),
});

export const BilibiliVideoRelationDtoSchema = z.object({
	sourceAid: z.string(),
	targetAid: z.string(),
	position: z.number().int().nonnegative(),
	capturedAt: z.string(),
});

export type DiscoverySweepRequest = z.infer<typeof DiscoverySweepRequestSchema>;
export type DiscoverySweepResponse = z.infer<typeof DiscoverySweepResponseSchema>;
export type ProcessRecommendationsResponse = z.infer<typeof ProcessRecommendationsResponseSchema>;
export type BilibiliVideoMetadataDto = z.infer<typeof BilibiliVideoMetadataDtoSchema>;
export type BilibiliVideoRelationDto = z.infer<typeof BilibiliVideoRelationDtoSchema>;

export const DiscoveryFilterConfigDtoSchema = z.object({
	whitelistSingers: z.array(z.string()),
	whitelistSongIndicators: z.array(z.string()),
	blacklistKeywords: z.array(z.string()),
	minDurationSeconds: z.number().int().positive(),
	maxDurationSeconds: z.number().int().positive(),
	rejectionSampleRate: z.number().min(0).max(1),
	modelEnabled: z.boolean(),
	modelThreshold: z.number().min(0).max(1),
});

export const ClassifierHealthDtoSchema = z.object({
	reachable: z.boolean(),
	modelsLoaded: z.boolean().nullable(),
});

export const UpdateDiscoveryFilterConfigRequestSchema = z.object({
	whitelistSingers: z.array(z.string()).optional(),
	whitelistSongIndicators: z.array(z.string()).optional(),
	blacklistKeywords: z.array(z.string()).optional(),
	minDurationSeconds: z.number().int().positive().optional(),
	maxDurationSeconds: z.number().int().positive().optional(),
	rejectionSampleRate: z.number().min(0).max(1).optional(),
	modelEnabled: z.boolean().optional(),
	modelThreshold: z.number().min(0).max(1).optional(),
});

export type DiscoveryFilterConfigDto = z.infer<typeof DiscoveryFilterConfigDtoSchema>;
export type ClassifierHealthDto = z.infer<typeof ClassifierHealthDtoSchema>;
export type UpdateDiscoveryFilterConfigRequest = z.infer<
	typeof UpdateDiscoveryFilterConfigRequestSchema
>;
