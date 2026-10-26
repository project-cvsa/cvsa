import type {
	InferenceHealth,
	InferenceInput,
	InferencePrediction,
} from "@cvsa/contracts/crawler/inference";

export type ClassifyVideoInput = InferenceInput;
export type ClassifyVideoResult = InferencePrediction;
export type SharedInferenceHealth = InferenceHealth;

export type InferenceDiagnostics = {
	status: "starting" | "ready" | "failed" | "closing" | "closed";
	activeRequests: number;
	queuedRequests: number;
	lastError?: string;
};
