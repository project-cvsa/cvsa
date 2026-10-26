import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { AkariClassifier, type AkariPrediction } from "../../ml/akari";
/**
 * Classifier client for the discovery pipeline.
 *
 * Two backends, one contract:
 *   1. **Remote** — `apps/inference` (the legacy FastAPI service on `:8544`):
 *        POST /classify  { title, description, tags, aid? }
 *                     -> { label, probabilities: [p(not_song), p(song_a), p(song_b)], aid? }
 *        GET  /health -> { status, models_loaded }
 *   2. **Local** — {@link AkariClassifier} running the ONNX models in-process
 *      through `onnxruntime-node`.
 *
 * The remote service is preferred when `ML_API_URL` is configured because it
 * keeps the ONNX runtime out of the crawler process. The local classifier is the
 * automatic fallback: it activates when the service is unreachable *and* the
 * model files exist on disk. If neither can answer, `classify` returns `null`
 * and the caller falls back to the deterministic rules — nothing here throws
 * into the discovery pipeline.
 *
 * `label === 0` means "not a VOCALOID/SVS song"; every other label means the
 * model considers it one. The pipeline only needs the aggregate "is a song"
 * probability, which is `1 - p[not_song]`.
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
	/** Model identity persisted alongside the decision, e.g. `"akari-3.17"`. */
	readonly modelVersion: string;
	/** Which backend produced the prediction. */
	readonly source: ClassifierBackend;
}

export type ClassifierBackend = "remote" | "local";

/**
 * Structural view of {@link AkariClassifier}: only the members the client uses.
 * Keeping it narrow lets tests inject a deterministic stub without spinning up
 * onnxruntime.
 */
export type LocalClassifier = Pick<
	AkariClassifier,
	"getStatus" | "classify" | "getModelVersionLabel"
>;

export interface ClassifierHealth {
	readonly reachable: boolean;
	readonly modelsLoaded: boolean | null;
}

export interface ClassifierClientOptions {
	/** Base URL of the HTTP inference service. Omit to run local-only. */
	readonly baseUrl?: string;
	readonly timeoutMs: number;
	/** Injected for tests; a default instance is created lazily otherwise. */
	readonly localClassifier?: LocalClassifier;
	/** Defaults to `true`: fall back to the local ONNX model. */
	readonly fallbackToLocal?: boolean;
	/**
	 * Try the local ONNX model first when its files exist. Off by default: the
	 * standalone inference service keeps the ONNX runtime out of this process.
	 */
	readonly preferLocal?: boolean;
}

/** Used when the remote service does not report its own model version. */
export const DEFAULT_CLASSIFIER_MODEL_VERSION = "akari-3.17";

type ClassifyResponseBody = {
	label?: unknown;
	probabilities?: unknown;
	model_version?: unknown;
	modelVersion?: unknown;
};

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
		return Number(value);
	}
	return undefined;
}

function normalizeText(value: string | null | undefined, fallback: string): string {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function toPrediction(
	label: number,
	probabilities: readonly number[],
	modelVersion: string,
	source: ClassifierBackend
): ClassifierPrediction {
	const notSong = probabilities[0] ?? 0;
	const songProbability = Math.min(1, Math.max(0, 1 - notSong));
	return { label, probabilities, songProbability, modelVersion, source };
}

export class VideoClassifierClient {
	private readonly localClassifier: LocalClassifier | undefined;
	private readonly fallbackToLocal: boolean;

	constructor(private readonly options: ClassifierClientOptions) {
		this.localClassifier =
			options.localClassifier ??
			(options.baseUrl === undefined || options.fallbackToLocal !== false
				? new AkariClassifier()
				: undefined);
		this.fallbackToLocal = options.fallbackToLocal ?? true;
	}

	/** The local ONNX classifier, when one is configured. */
	get local(): LocalClassifier | undefined {
		return this.localClassifier;
	}

	/**
	 * Classify one candidate. Returns `null` when neither backend can answer:
	 * the caller decides whether that is a hard failure or a rules-only fallback.
	 */
	async classify(input: ClassifierInput): Promise<ClassifierPrediction | null> {
		return traceTask("discovery.classifier.classify", async () => {
			if (this.options.preferLocal && this.localModelAvailable()) {
				const local = await this.classifyLocal(input);
				if (local) return local;
			}

			const remote = await this.classifyRemote(input);
			if (remote) return remote;

			const local = await this.classifyLocal(input);
			if (local) return local;

			return null;
		});
	}

	/** Whether the local ONNX artifacts are on disk (no initialization attempt). */
	private localModelAvailable(): boolean {
		if (!this.fallbackToLocal) return false;
		const status = this.localClassifier?.getStatus();
		return status?.embeddingExists === true && status.classifierExists;
	}

	private async classifyRemote(input: ClassifierInput): Promise<ClassifierPrediction | null> {
		const baseUrl = this.options.baseUrl;
		if (!baseUrl) return null;

		try {
			const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/classify`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					title: normalizeText(input.title, "untitled"),
					description: normalizeText(input.description, "N/A"),
					tags: normalizeText(input.tags?.join(" "), "empty"),
					...(input.aid !== undefined ? { aid: Number(input.aid) } : {}),
				}),
				signal: AbortSignal.timeout(this.options.timeoutMs),
			});

			if (!response.ok) {
				appLogger.warn("Classifier service returned an error", {
					component: "discovery-classifier",
					status: response.status,
				});
				return null;
			}

			const body = (await response.json()) as ClassifyResponseBody;
			const label = toFiniteNumber(body.label);
			const probabilities = Array.isArray(body.probabilities)
				? body.probabilities.map((value) => toFiniteNumber(value) ?? 0)
				: undefined;

			if (label === undefined || probabilities === undefined || probabilities.length === 0) {
				appLogger.warn("Classifier service returned an unexpected payload", {
					component: "discovery-classifier",
				});
				return null;
			}

			const modelVersion =
				typeof body.model_version === "string"
					? body.model_version
					: typeof body.modelVersion === "string"
						? body.modelVersion
						: DEFAULT_CLASSIFIER_MODEL_VERSION;

			return toPrediction(label, probabilities, modelVersion, "remote");
		} catch (error) {
			appLogger.warn("Classifier service is unreachable", {
				component: "discovery-classifier",
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	private async classifyLocal(input: ClassifierInput): Promise<ClassifierPrediction | null> {
		if (!this.fallbackToLocal) return null;
		const local = this.localClassifier;
		if (!local) return null;

		// Only pay for ONNX initialization when the model files are actually on
		// disk; otherwise every candidate would retry a doomed init.
		const status = local.getStatus();
		if (!status.embeddingExists || !status.classifierExists) return null;

		const prediction: AkariPrediction | null = await local.classify({
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

		return toPrediction(
			prediction.label,
			prediction.probabilities,
			prediction.modelVersion,
			"local"
		);
	}

	async health(): Promise<ClassifierHealth> {
		const baseUrl = this.options.baseUrl;
		if (baseUrl) {
			try {
				const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
					signal: AbortSignal.timeout(Math.min(this.options.timeoutMs, 5_000)),
				});
				if (response.ok) {
					const body = (await response.json()) as { models_loaded?: unknown };
					return { reachable: true, modelsLoaded: body.models_loaded === true };
				}
			} catch {
				// fall through to the local probe
			}
		}

		const local = this.localClassifier;
		if (local) {
			const status = local.getStatus();
			return {
				reachable: status.embeddingExists && status.classifierExists,
				modelsLoaded: status.ready,
			};
		}

		return { reachable: false, modelsLoaded: null };
	}
}
