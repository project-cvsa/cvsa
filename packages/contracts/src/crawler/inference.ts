import { z } from "zod";

export const InferenceInputSchema = z.object({
	title: z.string(),
	description: z.string(),
	tags: z.array(z.string()),
	aid: z.string().optional(),
});

const ProbabilitySchema = z.number().min(0).max(1);

export const InferencePredictionSchema = z
	.object({
		label: z.number().int().min(0).max(2),
		probabilities: z.tuple([ProbabilitySchema, ProbabilitySchema, ProbabilitySchema]),
		accepted: z.boolean(),
		modelVersion: z.string().min(1),
	})
	.superRefine((prediction, context) => {
		const probabilityTotal = prediction.probabilities.reduce((sum, value) => sum + value, 0);
		if (Math.abs(probabilityTotal - 1) > 0.001) {
			context.addIssue({
				code: "custom",
				message: "Probabilities must sum to 1",
				path: ["probabilities"],
			});
		}

		if (prediction.accepted !== (prediction.label !== 0)) {
			context.addIssue({
				code: "custom",
				message: "Label 0 is rejected and every other label is accepted",
				path: ["accepted"],
			});
		}
	});

export const InferenceBatchRequestSchema = z.array(InferenceInputSchema).min(1);
export const InferenceBatchResponseSchema = z.array(InferencePredictionSchema);

export const InferenceHealthSchema = z.object({
	ready: z.boolean(),
	modelVersion: z.string().min(1).optional(),
});

export type InferenceInput = z.infer<typeof InferenceInputSchema>;
export type InferencePrediction = z.infer<typeof InferencePredictionSchema>;
export type InferenceBatchRequest = z.infer<typeof InferenceBatchRequestSchema>;
export type InferenceBatchResponse = z.infer<typeof InferenceBatchResponseSchema>;
export type InferenceHealth = z.infer<typeof InferenceHealthSchema>;
