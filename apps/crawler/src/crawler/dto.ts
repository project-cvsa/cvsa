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
