import type { ClassifierHealthDto } from "@cvsa/contracts";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { IsolatedAkariClassifier } from "../../ml/isolatedAkari";
import type { LocalAkariClassifier, AkariHealth, AkariPrediction } from "../../ml/akari";

/**
 * Client for the supervised local ONNX process. Missing artifacts and model errors
 * return null so discovery can use its deterministic rules. Task cancellation also
 * terminates inference; the task context prevents a subsequent fallback from writing.
 */
export interface ClassifierInput {
	readonly title: string;
	readonly description?: string | null;
	readonly tags?: readonly string[];
	readonly aid?: bigint;
}

export interface ClassifierPrediction {
	readonly label: number;
	readonly probabilities: readonly number[];
	/** `1 - P(label = 0)`, clamped into [0, 1]. */
	readonly songProbability: number;
	/** `true` when the model picked a song class (any label except 0). */
	readonly isAccepted: boolean;
	/** Model identity persisted alongside the decision, e.g. `"akari-3.17"`. */
	readonly modelVersion: string;
}

/**
 * Structural view of {@link LocalAkariClassifier}: only the members the client
 * uses. Keeping it narrow lets tests inject a deterministic stub without
 * spinning up onnxruntime.
 */
export type LocalClassifier = Pick<LocalAkariClassifier, "classify" | "checkHealth">;

/** Wire shape of `GET /v2/discovery/classifier` (see `ClassifierHealthDtoSchema`). */
export type ClassifierHealth = ClassifierHealthDto;

export interface ClassifierClientOptions {
	/** Injected for tests; a supervised inference process is created otherwise. */
	readonly localClassifier?: LocalClassifier;
	readonly timeoutMs?: () => number;
}

/** Used when a prediction arrives without its own model version. */
export const DEFAULT_CLASSIFIER_MODEL_VERSION = "akari-3.17";

function toPrediction(prediction: AkariPrediction): ClassifierPrediction {
	const notSong = prediction.probabilities[0] ?? 0;
	const songProbability = Math.min(1, Math.max(0, 1 - notSong));
	return {
		label: prediction.label,
		probabilities: prediction.probabilities,
		songProbability,
		isAccepted: prediction.isAccepted,
		modelVersion: prediction.modelVersion || DEFAULT_CLASSIFIER_MODEL_VERSION,
	};
}

export class VideoClassifierClient {
	private readonly classifier: LocalClassifier;

	constructor(options: ClassifierClientOptions = {}) {
		this.classifier = options.localClassifier ?? new IsolatedAkariClassifier(options.timeoutMs);
	}

	close(): void {
		if (this.classifier instanceof IsolatedAkariClassifier) this.classifier.close();
	}

	/** The local classifier backing this client. */
	get local(): LocalClassifier {
		return this.classifier;
	}

	/**
	 * Classify one candidate. Returns `null` when the model is unavailable; the
	 * caller decides whether that is a hard failure or a rules-only fallback.
	 */
	async classify(input: ClassifierInput): Promise<ClassifierPrediction | null> {
		return traceTask("discovery.classifier.classify", async () => {
			try {
				const prediction = await this.classifier.classify({
					title: input.title,
					description: input.description ?? null,
					tags: input.tags ?? null,
					aid: input.aid,
				});
				if (!prediction) return null;

				appLogger.debug("Classified candidate with the local ONNX model", {
					component: "discovery-classifier",
					modelVersion: prediction.modelVersion,
				});

				return toPrediction(prediction);
			} catch (error) {
				appLogger.warn("Local classification failed", {
					component: "discovery-classifier",
					error: error instanceof Error ? error.message : String(error),
				});
				return null;
			}
		});
	}

	/**
	 * Rich health view: `status` distinguishes a loaded model from a degraded
	 * artifact set. Used by callers that need more than reachability.
	 */
	async checkHealth(): Promise<AkariHealth> {
		try {
			return await this.classifier.checkHealth();
		} catch (error) {
			return {
				status: "unreachable",
				modelLoaded: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Maps {@link checkHealth} onto the admin `ClassifierHealthDtoSchema`:
	 * `healthy` -> reachable + loaded, `degraded` -> reachable but not loaded,
	 * `unreachable` -> not reachable.
	 */
	async health(): Promise<ClassifierHealth> {
		const health = await this.checkHealth();
		return {
			reachable: health.status !== "unreachable",
			modelsLoaded: health.status === "unreachable" ? null : health.modelLoaded,
			modelVersion: health.modelVersion ?? null,
			error: health.error ?? null,
		};
	}
}
