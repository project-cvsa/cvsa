import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { LocalAkariClassifier, type AkariHealth, type AkariPrediction } from "../../ml/akari";

/**
 * In-process classifier client for the discovery pipeline.
 *
 * Classification runs inside the crawler through {@link LocalAkariClassifier}
 * (`onnxruntime-node`) — there is no HTTP hop to a separate inference service.
 * `label === 0` means "not a VOCALOID/SVS song"; every other label means the
 * model considers it one. The pipeline only needs the aggregate "is a song"
 * probability, which is `1 - p[not_song]`.
 *
 * Nothing here throws into the discovery pipeline: a missing or broken model
 * makes {@link VideoClassifierClient.classify} return `null`, and the caller
 * falls back to the deterministic rules.
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
export interface ClassifierHealth {
	readonly reachable: boolean;
	readonly modelsLoaded: boolean | null;
}

export interface ClassifierClientOptions {
	/** Injected for tests; a real in-process classifier is created otherwise. */
	readonly localClassifier?: LocalClassifier;
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
		this.classifier = options.localClassifier ?? new LocalAkariClassifier();
	}

	/** The in-process ONNX classifier backing this client. */
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

				appLogger.debug("Classified candidate with the in-process ONNX model", {
					component: "discovery-classifier",
					modelVersion: prediction.modelVersion,
				});

				return toPrediction(prediction);
			} catch (error) {
				appLogger.warn("In-process classification failed", {
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
		switch (health.status) {
			case "healthy":
				return { reachable: true, modelsLoaded: true };
			case "degraded":
				return { reachable: true, modelsLoaded: false };
			default:
				return { reachable: false, modelsLoaded: null };
		}
	}
}
