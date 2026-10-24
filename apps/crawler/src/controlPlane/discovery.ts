import { Elysia } from "elysia";
import { ErrorResponseSchema } from "@cvsa/contracts";
import type { BilibiliVideoMetadata, BilibiliVideoRelation } from "@cvsa/snapshot-db";
import {
	BilibiliVideoMetadataDtoSchema,
	BilibiliVideoRelationDtoSchema,
	DiscoverySweepRequestSchema,
	DiscoverySweepResponseSchema,
	ProcessRecommendationsResponseSchema,
	type BilibiliVideoMetadataDto,
	type BilibiliVideoRelationDto,
} from "../crawler";
import { discoveryRepository, discoveryService } from "../container";
import { z } from "zod";

function toMetadataDto(m: BilibiliVideoMetadata): BilibiliVideoMetadataDto {
	return {
		aid: m.aid.toString(),
		bvid: m.bvid,
		title: m.title,
		description: m.description,
		pic: m.pic,
		pubdate: m.pubdate ? m.pubdate.toString() : null,
		duration: m.duration,
		mid: m.mid ? m.mid.toString() : null,
		ownerName: m.ownerName,
		ownerFace: m.ownerFace,
		tid: m.tid,
		tname: m.tname,
		copyright: m.copyright,
		tags: m.tags,
		capturedAt: m.capturedAt.toString(),
		updatedAt: m.updatedAt.toString(),
	};
}

function toRelationDto(r: BilibiliVideoRelation): BilibiliVideoRelationDto {
	return {
		sourceAid: r.sourceAid.toString(),
		targetAid: r.targetAid.toString(),
		position: r.position,
		capturedAt: r.capturedAt.toString(),
	};
}

export const discoveryRoutes = new Elysia()
	.post(
		"/sweep",
		async ({ body }) => {
			const result = await discoveryService.runSearchSweep(body);
			return result;
		},
		{
			body: DiscoverySweepRequestSchema,
			response: {
				200: DiscoverySweepResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/recommendations/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const sourceAid = BigInt(params.aid);
			const result = await discoveryService.processVideoRecommendations(sourceAid);
			return {
				sourceAid: result.sourceAid.toString(),
				relationsCount: result.relationsCount,
				newTracked: result.newTracked,
			};
		},
		{
			response: {
				200: ProcessRecommendationsResponseSchema,
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/metadata/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const metadata = await discoveryRepository.getMetadata(BigInt(params.aid));
			if (!metadata) {
				return status(404, { code: "NOT_FOUND", message: "Video metadata not found" });
			}
			return toMetadataDto(metadata);
		},
		{
			response: {
				200: BilibiliVideoMetadataDtoSchema,
				401: ErrorResponseSchema,
				404: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	)
	.get(
		"/relations/:aid",
		async ({ params, status }) => {
			if (!/^\d+$/.test(params.aid)) {
				return status(422, { code: "VALIDATION_ERROR", message: "Invalid aid" });
			}
			const relations = await discoveryRepository.getRelationsBySource(BigInt(params.aid));
			return relations.map(toRelationDto);
		},
		{
			response: {
				200: z.array(BilibiliVideoRelationDtoSchema),
				401: ErrorResponseSchema,
				422: ErrorResponseSchema,
			},
		}
	);
