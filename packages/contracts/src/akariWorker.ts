import { z } from "zod";

export const AkariWorkerRequestSchema = z.discriminatedUnion("kind", [
	z.object({
		id: z.number().int(),
		kind: z.literal("classify"),
		input: z.object({
			title: z.string(),
			description: z.string().nullable().optional(),
			tags: z
				.union([z.array(z.string()), z.string()])
				.nullable()
				.optional(),
		}),
	}),
	z.object({ id: z.number().int(), kind: z.literal("health") }),
]);
export type AkariWorkerRequest = z.infer<typeof AkariWorkerRequestSchema>;
export const AkariWorkerReplySchema = z.discriminatedUnion("kind", [
	z.object({
		id: z.number().int(),
		kind: z.literal("classify"),
		prediction: z
			.object({
				label: z.number(),
				probabilities: z.array(z.number()),
				songProbability: z.number(),
				isAccepted: z.boolean(),
				modelVersion: z.string(),
			})
			.nullable(),
	}),
	z.object({
		id: z.number().int(),
		kind: z.literal("health"),
		health: z.object({
			status: z.enum(["healthy", "degraded", "unreachable"]),
			modelLoaded: z.boolean(),
			modelVersion: z.string().optional(),
			latencyMs: z.number().optional(),
			error: z.string().optional(),
		}),
	}),
	z.object({ id: z.number().int(), kind: z.literal("error"), message: z.string() }),
]);
export type AkariWorkerReply = z.infer<typeof AkariWorkerReplySchema>;
