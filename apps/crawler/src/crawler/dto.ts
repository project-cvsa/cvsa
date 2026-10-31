import { CrawlerStatusDtoSchema } from "@cvsa/contracts";
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
	revision: z.number().int().nonnegative(),
	config: NetworkRuntimeConfigSchema,
	updatedAt: z.coerce.date(),
});

export const ReplaceNetworkRuntimeConfigRequestSchema = z.object({
	revision: z.number().int().nonnegative(),
	config: NetworkRuntimeConfigSchema,
});

/** Mirrors `NetworkAdapterRuntimeStatus` from the scheduler's contracts. */
export const NetworkAdapterRuntimeStatusSchema = CrawlerStatusDtoSchema.shape.adapters.element;
export const NetworkRuntimeStatusSchema = CrawlerStatusDtoSchema;

export {
	BilibiliVideoMetadataDtoSchema,
	BilibiliVideoRelationDtoSchema,
	ClassifierHealthDtoSchema,
	DiscoveryFilterConfigDtoSchema,
	DiscoverySweepRequestSchema,
	DiscoverySweepResponseSchema,
	ProcessRecommendationsResponseSchema,
	PromoteTrackingVideoRequestSchema,
	RegisterTrackingVideosRequestSchema,
	RegisterTrackingVideosResponseSchema,
	UpdateDiscoveryFilterConfigRequestSchema,
	VideoTrackingDtoSchema,
	type BilibiliVideoMetadataDto,
	type BilibiliVideoRelationDto,
	type ClassifierHealthDto,
	type DiscoveryFilterConfigDto,
	type DiscoverySweepRequest,
	type DiscoverySweepResponse,
	type ProcessRecommendationsResponse,
	type PromoteTrackingVideoRequest,
	type RegisterTrackingVideosRequest,
	type RegisterTrackingVideosResponse,
	type UpdateDiscoveryFilterConfigRequest,
	type VideoTrackingDto,
} from "@cvsa/contracts";

export type NetworkRuntimeConfigDocument = z.infer<typeof NetworkRuntimeConfigDocumentSchema>;
export type ReplaceNetworkRuntimeConfigRequest = z.infer<
	typeof ReplaceNetworkRuntimeConfigRequestSchema
>;
export type NetworkAdapterRuntimeStatusDto = z.infer<typeof NetworkAdapterRuntimeStatusSchema>;
export type NetworkRuntimeStatus = z.infer<typeof NetworkRuntimeStatusSchema>;
