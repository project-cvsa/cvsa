import { z } from "zod";

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
	tags: z.unknown().nullable(),
	capturedAt: z.string(),
	updatedAt: z.string(),
});

export const BilibiliVideoRelationDtoSchema = z.object({
	sourceAid: z.string(),
	targetAid: z.string(),
	position: z.number().int().nonnegative(),
	capturedAt: z.string(),
});

export const DiscoveryFilterConfigDtoSchema = z.object({
	whitelistSingers: z.array(z.string()),
	whitelistSongIndicators: z.array(z.string()),
	blacklistKeywords: z.array(z.string()),
	minDurationSeconds: z.number().int().positive(),
	maxDurationSeconds: z.number().int().positive(),
	rejectionSampleRate: z.number().min(0).max(1),
});

export const UpdateDiscoveryFilterConfigRequestSchema = z.object({
	whitelistSingers: z.array(z.string()).optional(),
	whitelistSongIndicators: z.array(z.string()).optional(),
	blacklistKeywords: z.array(z.string()).optional(),
	minDurationSeconds: z.number().int().positive().optional(),
	maxDurationSeconds: z.number().int().positive().optional(),
	rejectionSampleRate: z.number().min(0).max(1).optional(),
});

export const CrawlerStatusDtoSchema = z.object({
	ready: z.boolean(),
	revision: z.number().nullable(),
	adapters: z.array(
		z.object({
			id: z.string(),
			enabled: z.boolean(),
			healthState: z.string(),
			healthFactor: z.number(),
			effectiveWeight: z.number(),
			consecutiveFailures: z.number(),
			openUntil: z.number().nullable(),
		})
	),
});

export type VideoTrackingDto = z.infer<typeof VideoTrackingDtoSchema>;
export type RegisterTrackingVideosRequest = z.infer<typeof RegisterTrackingVideosRequestSchema>;
export type RegisterTrackingVideosResponse = z.infer<typeof RegisterTrackingVideosResponseSchema>;
export type PromoteTrackingVideoRequest = z.infer<typeof PromoteTrackingVideoRequestSchema>;
export type DiscoverySweepRequest = z.infer<typeof DiscoverySweepRequestSchema>;
export type DiscoverySweepResponse = z.infer<typeof DiscoverySweepResponseSchema>;
export type ProcessRecommendationsResponse = z.infer<typeof ProcessRecommendationsResponseSchema>;
export type BilibiliVideoMetadataDto = z.infer<typeof BilibiliVideoMetadataDtoSchema>;
export type BilibiliVideoRelationDto = z.infer<typeof BilibiliVideoRelationDtoSchema>;
export type DiscoveryFilterConfigDto = z.infer<typeof DiscoveryFilterConfigDtoSchema>;
export type UpdateDiscoveryFilterConfigRequest = z.infer<
	typeof UpdateDiscoveryFilterConfigRequestSchema
>;
export type CrawlerStatusDto = z.infer<typeof CrawlerStatusDtoSchema>;
