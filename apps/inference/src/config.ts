import type { InferenceEngineConfig } from "./engine";
import { InferenceError } from "./engine";

export type InferenceServerConfig = InferenceEngineConfig & {
	host: string;
	port: number;
};

export function loadInferenceServerConfig(
	environment: Record<string, string | undefined> = process.env
): InferenceServerConfig {
	const embeddingModelPath = requiredEnvironmentValue(
		environment,
		"CVSA_INFERENCE_EMBEDDING_MODEL_PATH"
	);
	const classifierModelPath = requiredEnvironmentValue(
		environment,
		"CVSA_INFERENCE_CLASSIFIER_MODEL_PATH"
	);
	const tokenizerPath = requiredEnvironmentValue(environment, "CVSA_INFERENCE_TOKENIZER_PATH");
	const portValue = environment.CVSA_INFERENCE_PORT ?? "8544";
	const port = Number(portValue);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new InferenceError(
			"INVALID_INPUT",
			"CVSA_INFERENCE_PORT must be an integer from 1 to 65535."
		);
	}
	const host = environment.CVSA_INFERENCE_HOST?.trim() || "0.0.0.0";
	return { embeddingModelPath, classifierModelPath, tokenizerPath, host, port };
}

function requiredEnvironmentValue(
	environment: Record<string, string | undefined>,
	name: string
): string {
	const value = environment[name]?.trim();
	if (!value) {
		throw new InferenceError("INVALID_INPUT", `${name} must be configured explicitly.`);
	}
	return value;
}
