import {
	InferenceBatchRequestSchema,
	InferenceBatchResponseSchema,
	InferenceHealthSchema,
	InferenceInputSchema,
	InferencePredictionSchema,
} from "@cvsa/contracts/crawler/inference";
import { Elysia } from "elysia";
import { type InferenceEngine, InferenceError } from "./engine";

export function createInferenceApp(engine: InferenceEngine) {
	return new Elysia()
		.onError(({ code, error, set }) => {
			if (error instanceof InferenceError) {
				set.status = statusForInferenceError(error);
				return { code: error.code.toLowerCase(), message: error.message };
			}
			if (code === "VALIDATION" || code === "PARSE") {
				set.status = 400;
				return {
					code: "invalid_request",
					message: "Request body did not match the inference contract.",
				};
			}
			if (code === "NOT_FOUND") {
				set.status = 404;
				return { code: "not_found", message: "Inference endpoint was not found." };
			}
			set.status = 500;
			return { code: "internal_error", message: "Inference request failed." };
		})
		.get("/health", () => engine.getHealth(), {
			response: InferenceHealthSchema,
		})
		.get(
			"/ready",
			({ set }) => {
				const health = engine.getHealth();
				if (!health.ready) set.status = 503;
				return health;
			},
			{ response: InferenceHealthSchema }
		)
		.post("/classify", ({ body }) => engine.classify(InferenceInputSchema.parse(body)), {
			body: InferenceInputSchema,
			response: InferencePredictionSchema,
		})
		.post(
			"/batch",
			({ body }) => engine.classifyBatch(InferenceBatchRequestSchema.parse(body)),
			{
				body: InferenceBatchRequestSchema,
				response: InferenceBatchResponseSchema,
			}
		);
}

function statusForInferenceError(error: InferenceError): number {
	switch (error.code) {
		case "NOT_READY":
		case "CLOSING":
			return 503;
		case "OVERLOADED":
			return 429;
		case "INVALID_INPUT":
		case "INPUT_TOO_LONG":
			return 400;
		case "MODEL_UNAVAILABLE":
		case "MODEL_INTEGRITY":
		case "MODEL_DIMENSION":
			return 503;
	}
}
