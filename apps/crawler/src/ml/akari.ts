import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appLogger } from "@cvsa/logger";
import { traceTask } from "@cvsa/observability";
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";
import * as ort from "onnxruntime-node";
import {
	AKARI_MODEL_VERSION,
	CLASSIFIER_CHANNELS,
	EMBEDDING_DIMENSION,
	JINA_EMBEDDING_TOKENIZER,
} from "./const";

export interface AkariClassificationInput {
	readonly title: string;
	readonly description?: string | null;
	readonly tags?: readonly string[] | string | null;
	readonly aid?: bigint | number;
}

export interface AkariPrediction {
	readonly label: number;
	readonly probabilities: readonly number[];
	/** `1 - P(label = 0)`, clamped into [0, 1]. */
	readonly songProbability: number;
	/** `true` when the model picked a song class (any label except 0). */
	readonly isAccepted: boolean;
	readonly modelVersion: string;
}

/** Health of the in-process classifier, shaped for the control plane. */
export type AkariHealthStatus = "healthy" | "degraded" | "unreachable";

export interface AkariHealth {
	readonly status: AkariHealthStatus;
	readonly modelLoaded: boolean;
	readonly modelVersion?: string;
	readonly latencyMs?: number;
	readonly error?: string;
}

/** Filesystem-level view of the artifacts, useful for diagnostics. */
export interface AkariStatus {
	readonly ready: boolean;
	readonly modelVersion: string;
	readonly modelDir: string;
	readonly embeddingPath: string;
	readonly classifierPath: string;
	readonly embeddingExists: boolean;
	readonly classifierExists: boolean;
	readonly lastError: string | null;
}

export interface AkariModelOptions {
	readonly modelDir?: string;
	readonly modelVersion?: string;
	readonly tokenizerModel?: string;
	/** Load the ONNX sessions eagerly instead of on the first prediction. */
	readonly autoInit?: boolean;
}

/** Stable for both monorepo development and /app container layouts. */
const DEFAULT_MODEL_DIR = fileURLToPath(new URL("../../../../model/", import.meta.url));

/**
 * Canonical model label persisted next to every prediction, e.g. `akari-3.17`.
 * Raw artifact versions on disk stay bare (`3.17.onnx`).
 */
export function formatAkariModelVersion(version: string): string {
	return version.startsWith("akari-") ? version : `akari-${version}`;
}

function normalizeChannelText(value: string | null | undefined, fallback: string): string {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/** Tags are sent as a single space-joined channel, matching the training data. */
function normalizeTags(tags: AkariClassificationInput["tags"]): string {
	if (typeof tags === "string") return normalizeChannelText(tags, "empty");
	if (Array.isArray(tags)) return normalizeChannelText(tags.join(" "), "empty");
	return "empty";
}

function resolveModelDir(override: string | undefined): string {
	return path.resolve(override ?? process.env.CRAWLER_MODEL_DIR ?? DEFAULT_MODEL_DIR);
}

function elapsedMs(startedAt: number): number {
	return Math.max(0, Math.round(performance.now() - startedAt));
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** ONNX tensor payloads are a union; the models we ship only emit float32. */
function readFloat32Tensor(tensor: ort.Tensor): Float32Array {
	if (!(tensor.data instanceof Float32Array)) {
		throw new Error("ONNX model returned a non-float32 tensor");
	}
	return tensor.data;
}

export function softmax(logits: Float32Array | readonly number[]): number[] {
	if (logits.length === 0) return [];
	let maxLogit = -Infinity;
	for (const val of logits) {
		if (val > maxLogit) maxLogit = val;
	}
	const exponents: number[] = new Array(logits.length);
	let sum = 0;
	for (let i = 0; i < logits.length; i++) {
		const exp = Math.exp((logits[i] ?? 0) - maxLogit);
		exponents[i] = exp;
		sum += exp;
	}
	if (sum <= 0) return exponents.map(() => 0);
	return exponents.map((exp) => exp / sum);
}

/**
 * In-process ONNX Runtime classifier (ported from `cvsa-legacy/packages/crawler/ml/akari.ts`).
 *
 * Loads:
 *   1. `<modelDir>/embedding/model.onnx` (`alikia2x/jina-embedding-v3-m2v-1024`, 1024d)
 *   2. `<modelDir>/akari/<version>.onnx` (3x1024d channel classifier)
 *
 * The tokenizer comes straight from HuggingFace
 * (`alikia2x/jina-embedding-v3-m2v-1024`) — there is no local tokenizer asset
 * and no hash verification: the crawler trusts the published model revision.
 *
 * `modelDir` defaults to `CRAWLER_MODEL_DIR` or the repository model directory. When the ONNX files
 * have not been uploaded yet the classifier stays in a pending state and
 * {@link classify} returns `null`, so the discovery pipeline degrades to its
 * deterministic rules instead of failing.
 */
export class LocalAkariClassifier {
	private readonly modelDir: string;
	private readonly tokenizerModel: string;
	private modelVersion: string;

	private tokenizer: PreTrainedTokenizer | null = null;
	private embeddingSession: ort.InferenceSession | null = null;
	private classifierSession: ort.InferenceSession | null = null;
	private initPromise: Promise<boolean> | null = null;
	private lastError: string | null = null;

	constructor(options: AkariModelOptions = {}) {
		this.modelDir = resolveModelDir(options.modelDir);
		this.modelVersion = formatArtifactVersion(
			options.modelVersion ?? process.env.AKARI_MODEL_VERSION ?? AKARI_MODEL_VERSION
		);
		this.tokenizerModel = options.tokenizerModel ?? JINA_EMBEDDING_TOKENIZER;
		if (options.autoInit) void this.init();
	}

	get embeddingPath(): string {
		return path.join(this.modelDir, "embedding", "model.onnx");
	}

	get classifierPath(): string {
		return path.join(this.modelDir, "akari", `${this.modelVersion}.onnx`);
	}

	getVersion(): string {
		return this.modelVersion;
	}

	/** Label written into `ClassifierPrediction.modelVersion`. */
	getModelVersionLabel(): string {
		return formatAkariModelVersion(this.modelVersion);
	}

	setVersion(version: string): void {
		const artifactVersion = formatArtifactVersion(version);
		if (artifactVersion !== this.modelVersion) {
			this.modelVersion = artifactVersion;
			this.classifierSession = null;
			this.initPromise = null;
		}
	}

	isReady(): boolean {
		return (
			this.tokenizer !== null &&
			this.embeddingSession !== null &&
			this.classifierSession !== null
		);
	}

	getStatus(): AkariStatus {
		return {
			ready: this.isReady(),
			modelVersion: this.modelVersion,
			modelDir: this.modelDir,
			embeddingPath: this.embeddingPath,
			classifierPath: this.classifierPath,
			embeddingExists: fs.existsSync(this.embeddingPath),
			classifierExists: fs.existsSync(this.classifierPath),
			lastError: this.lastError,
		};
	}

	async init(): Promise<boolean> {
		if (this.isReady()) return true;
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				if (!fs.existsSync(this.embeddingPath) || !fs.existsSync(this.classifierPath)) {
					this.lastError = `ONNX model files not found at ${this.embeddingPath} or ${this.classifierPath}`;
					appLogger.warn(
						"Local ONNX models not present on disk yet; classifier in pending state",
						{
							component: "ml-akari",
							embeddingPath: this.embeddingPath,
							classifierPath: this.classifierPath,
						}
					);
					return false;
				}

				// The tokenizer is downloaded/cached by HuggingFace; no local
				// tokenizer files are required.
				this.tokenizer ??= await AutoTokenizer.from_pretrained(this.tokenizerModel);
				this.embeddingSession ??= await ort.InferenceSession.create(this.embeddingPath, {
					executionProviders: ["cpu"],
				});
				this.classifierSession ??= await ort.InferenceSession.create(this.classifierPath, {
					executionProviders: ["cpu"],
				});

				this.lastError = null;
				appLogger.info("In-process ONNX Akari classifier initialized", {
					component: "ml-akari",
					modelVersion: this.modelVersion,
					modelDir: this.modelDir,
				});
				return true;
			} catch (error) {
				this.lastError = messageOf(error);
				appLogger.warn("Failed to initialize the in-process ONNX Akari classifier", {
					component: "ml-akari",
					error: this.lastError,
				});
				return false;
			} finally {
				this.initPromise = null;
			}
		})();

		return this.initPromise;
	}

	/**
	 * In-process health probe for `GET /v2/discovery/classifier`.
	 *
	 * The classifier is always "reachable" (it lives in this process), so the
	 * probe distinguishes a loaded model (`healthy`) from a missing or broken
	 * artifact set (`degraded`). `unreachable` is reserved for a probe that
	 * cannot run at all.
	 */
	async checkHealth(): Promise<AkariHealth> {
		const startedAt = performance.now();
		const loaded = await this.init();
		const latencyMs = elapsedMs(startedAt);
		const modelVersion = this.getModelVersionLabel();

		if (loaded) {
			return { status: "healthy", modelLoaded: true, modelVersion, latencyMs };
		}

		return {
			status: "degraded",
			modelLoaded: false,
			modelVersion,
			latencyMs,
			error: this.lastError ?? "ONNX classifier is not initialized",
		};
	}

	private async getJinaEmbeddings1024(texts: [string, string, string]): Promise<Float32Array> {
		if (!this.tokenizer || !this.embeddingSession) {
			throw new Error("Embedding session or tokenizer is not initialized");
		}

		const encoded = await this.tokenizer(texts, {
			add_special_tokens: false,
			return_tensor: false,
		});

		const rawIds = encoded.input_ids;
		const tokenRows: number[][] = rawIds.map((row) =>
			Array.isArray(row) && row.length > 0 ? row : [0]
		);

		const offsets: number[] = [0];
		let runningSum = 0;
		for (let i = 0; i < tokenRows.length - 1; i++) {
			runningSum += tokenRows[i]?.length ?? 0;
			offsets.push(runningSum);
		}

		const flattenedInputIds = tokenRows.flat();

		const inputs: Record<string, ort.Tensor> = {
			input_ids: new ort.Tensor(
				"int64",
				BigInt64Array.from(flattenedInputIds, (id) => BigInt(id)),
				[flattenedInputIds.length]
			),
			offsets: new ort.Tensor(
				"int64",
				BigInt64Array.from(offsets, (offset) => BigInt(offset)),
				[offsets.length]
			),
		};

		const outputs = await this.embeddingSession.run(inputs);
		const embeddingTensor = outputs.embeddings ?? Object.values(outputs)[0];
		if (!embeddingTensor) {
			throw new Error("Embedding ONNX model returned no output tensor");
		}
		return Float32Array.from(readFloat32Tensor(embeddingTensor));
	}

	private async runClassification(embeddings: Float32Array): Promise<number[]> {
		if (!this.classifierSession) {
			throw new Error("Classifier session is not initialized");
		}
		const expectedLength = CLASSIFIER_CHANNELS * EMBEDDING_DIMENSION;
		if (embeddings.length !== expectedLength) {
			throw new Error(
				`Expected ${expectedLength} embedding values, received ${embeddings.length}`
			);
		}

		const inputTensor = new ort.Tensor("float32", embeddings, [
			1,
			CLASSIFIER_CHANNELS,
			EMBEDDING_DIMENSION,
		]);
		const outputs = await this.classifierSession.run({ channel_features: inputTensor });
		const logitsTensor = outputs.logits ?? Object.values(outputs)[0];
		if (!logitsTensor) {
			throw new Error("Classifier ONNX model returned no logits tensor");
		}
		return softmax(readFloat32Tensor(logitsTensor));
	}

	async classify(input: AkariClassificationInput): Promise<AkariPrediction | null> {
		return traceTask("ml.akari.classify", async () => {
			if (!this.isReady()) {
				const initialized = await this.init();
				if (!initialized) return null;
			}

			try {
				const title = normalizeChannelText(input.title, "untitled");
				const description = normalizeChannelText(input.description, "N/A");
				const tagsStr = normalizeTags(input.tags);

				const embeddings = await this.getJinaEmbeddings1024([title, description, tagsStr]);
				const probabilities = await this.runClassification(embeddings);
				if (probabilities.length === 0) return null;

				let bestLabel = 0;
				let bestProb = probabilities[0] ?? 0;
				for (let i = 1; i < probabilities.length; i++) {
					const p = probabilities[i] ?? 0;
					if (p > bestProb) {
						bestProb = p;
						bestLabel = i;
					}
				}

				const notSongProb = probabilities[0] ?? 0;
				const songProbability = Math.min(1, Math.max(0, 1 - notSongProb));

				return {
					label: bestLabel,
					probabilities,
					songProbability,
					isAccepted: bestLabel !== 0,
					modelVersion: this.getModelVersionLabel(),
				};
			} catch (error) {
				this.lastError = messageOf(error);
				appLogger.warn("In-process ONNX classification failed", {
					component: "ml-akari",
					aid: input.aid !== undefined ? String(input.aid) : undefined,
					error: this.lastError,
				});
				return null;
			}
		});
	}
}

/** `akari-3.17` -> `3.17`, so the on-disk file name stays bare. */
function formatArtifactVersion(version: string): string {
	return version.startsWith("akari-") ? version.slice("akari-".length) : version;
}
