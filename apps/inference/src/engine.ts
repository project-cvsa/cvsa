import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";
import * as ort from "onnxruntime-node";
import { AKARI_MODEL_MANIFEST } from "./modelManifest";
import type {
	ClassifyVideoInput,
	ClassifyVideoResult,
	InferenceDiagnostics,
	SharedInferenceHealth,
} from "./types";

export type InferenceErrorCode =
	| "NOT_READY"
	| "CLOSING"
	| "OVERLOADED"
	| "INVALID_INPUT"
	| "INPUT_TOO_LONG"
	| "MODEL_UNAVAILABLE"
	| "MODEL_INTEGRITY"
	| "MODEL_DIMENSION";

export class InferenceError extends Error {
	public constructor(
		public readonly code: InferenceErrorCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = "InferenceError";
	}
}

export type InferenceEngineConfig = {
	embeddingModelPath: string;
	classifierModelPath: string;
	tokenizerPath: string;
	maxInputTokens?: number;
	maxBatchSize?: number;
	maxConcurrency?: number;
	maxQueuedRequests?: number;
};

type EngineLimits = {
	maxInputTokens: number;
	maxBatchSize: number;
};

type ScheduledTask<T> = {
	run: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
};

export class BoundedInferenceExecutor {
	private activeCount = 0;
	private readonly queue: Array<() => void> = [];
	private accepting = true;
	private drainResolvers: Array<() => void> = [];

	public constructor(
		private readonly maxConcurrency: number,
		private readonly maxQueuedRequests: number
	) {
		if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
			throw new InferenceError("INVALID_INPUT", "maxConcurrency must be a positive integer.");
		}
		if (!Number.isInteger(maxQueuedRequests) || maxQueuedRequests < 0) {
			throw new InferenceError(
				"INVALID_INPUT",
				"maxQueuedRequests must be a non-negative integer."
			);
		}
	}

	public get activeRequests(): number {
		return this.activeCount;
	}

	public get queuedRequests(): number {
		return this.queue.length;
	}

	public submit<T>(run: () => Promise<T>): Promise<T> {
		if (!this.accepting) {
			return Promise.reject(new InferenceError("CLOSING", "Inference is stopping."));
		}
		if (
			this.activeCount >= this.maxConcurrency &&
			this.queue.length >= this.maxQueuedRequests
		) {
			return Promise.reject(new InferenceError("OVERLOADED", "Inference queue is full."));
		}

		return new Promise<T>((resolve, reject) => {
			const task: ScheduledTask<T> = { run, resolve, reject };
			const start = (): void => this.startTask(task);
			if (this.activeCount < this.maxConcurrency) {
				start();
			} else {
				this.queue.push(start);
			}
		});
	}

	public stopAccepting(): void {
		this.accepting = false;
	}

	public async drain(): Promise<void> {
		if (this.activeCount === 0 && this.queue.length === 0) return;
		await new Promise<void>((resolve) => this.drainResolvers.push(resolve));
	}

	private startTask<T>(task: ScheduledTask<T>): void {
		this.activeCount += 1;
		void Promise.resolve()
			.then(task.run)
			.then(
				(value) => {
					task.resolve(value);
					this.finishTask();
				},
				(error: unknown) => {
					task.reject(error);
					this.finishTask();
				}
			);
	}

	private finishTask(): void {
		this.activeCount -= 1;
		const next = this.queue.shift();
		if (next) {
			next();
		}
		if (this.activeCount === 0 && this.queue.length === 0) {
			for (const resolve of this.drainResolvers) resolve();
			this.drainResolvers = [];
		}
	}
}

export function validateFeatureShape(features: Float32Array): void {
	const expectedLength =
		AKARI_MODEL_MANIFEST.classifier.featureRows * AKARI_MODEL_MANIFEST.classifier.featureWidth;
	if (features.length !== expectedLength) {
		throw new InferenceError(
			"MODEL_DIMENSION",
			`Classifier requires ${expectedLength} feature values; received ${features.length}.`
		);
	}
}

export function validateTokenCount(tokenCount: number, maxInputTokens: number): void {
	if (tokenCount > maxInputTokens) {
		throw new InferenceError(
			"INPUT_TOO_LONG",
			`Input has ${tokenCount} tokens; the limit is ${maxInputTokens}.`
		);
	}
}

export class InferenceEngine {
	private status: InferenceDiagnostics["status"] = "starting";
	private lastError: string | undefined;
	private initializePromise: Promise<void> | undefined;
	private closePromise: Promise<void> | undefined;
	private tokenizer: PreTrainedTokenizer | undefined;
	private embeddingSession: ort.InferenceSession | undefined;
	private classifierSession: ort.InferenceSession | undefined;
	private readonly executor: BoundedInferenceExecutor;
	private readonly limits: EngineLimits;

	public constructor(private readonly config: InferenceEngineConfig) {
		this.limits = {
			maxInputTokens: config.maxInputTokens ?? AKARI_MODEL_MANIFEST.maxInputTokens,
			maxBatchSize: config.maxBatchSize ?? 32,
		};
		this.executor = new BoundedInferenceExecutor(
			config.maxConcurrency ?? 2,
			config.maxQueuedRequests ?? 16
		);
		if (!Number.isInteger(this.limits.maxInputTokens) || this.limits.maxInputTokens < 1) {
			throw new InferenceError("INVALID_INPUT", "maxInputTokens must be a positive integer.");
		}
		if (!Number.isInteger(this.limits.maxBatchSize) || this.limits.maxBatchSize < 1) {
			throw new InferenceError("INVALID_INPUT", "maxBatchSize must be a positive integer.");
		}
		for (const [name, value] of Object.entries({
			embeddingModelPath: config.embeddingModelPath,
			classifierModelPath: config.classifierModelPath,
			tokenizerPath: config.tokenizerPath,
		})) {
			if (value.trim().length === 0) {
				throw new InferenceError("INVALID_INPUT", `${name} must be configured explicitly.`);
			}
		}
	}

	public getHealth(): SharedInferenceHealth {
		const ready = this.status === "ready";
		return ready ? { ready, modelVersion: AKARI_MODEL_MANIFEST.modelVersion } : { ready };
	}

	public getDiagnostics(): InferenceDiagnostics {
		const base = {
			status: this.status,
			activeRequests: this.executor.activeRequests,
			queuedRequests: this.executor.queuedRequests,
		};
		return this.lastError ? { ...base, lastError: this.lastError } : base;
	}

	public initialize(): Promise<void> {
		if (this.status === "ready") return Promise.resolve();
		if (this.status === "closing" || this.status === "closed") {
			return Promise.reject(new InferenceError("CLOSING", "Inference is stopping."));
		}
		if (this.initializePromise) return this.initializePromise;
		this.status = "starting";
		this.initializePromise = this.loadModels();
		return this.initializePromise;
	}

	public classify(input: ClassifyVideoInput): Promise<ClassifyVideoResult> {
		this.assertReady();
		this.validateInput(input);
		return this.executor.submit(() => this.classifyOne(input));
	}

	public classifyBatch(inputs: ClassifyVideoInput[]): Promise<ClassifyVideoResult[]> {
		this.assertReady();
		if (inputs.length === 0) {
			return Promise.reject(
				new InferenceError("INVALID_INPUT", "Batch must contain at least one input.")
			);
		}
		if (inputs.length > this.limits.maxBatchSize) {
			return Promise.reject(
				new InferenceError(
					"INVALID_INPUT",
					`Batch size must not exceed ${this.limits.maxBatchSize}.`
				)
			);
		}
		for (const input of inputs) this.validateInput(input);
		return this.executor.submit(async () => {
			const results: ClassifyVideoResult[] = [];
			for (const input of inputs) results.push(await this.classifyOne(input));
			return results;
		});
	}

	public close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.status = "closing";
		this.executor.stopAccepting();
		this.closePromise = this.closeAfterDrain();
		return this.closePromise;
	}

	private async closeAfterDrain(): Promise<void> {
		try {
			await this.initializePromise;
		} catch {
			// Initialization records its failure and releases partially created sessions.
		}
		await this.executor.drain();
		const sessions = [this.embeddingSession, this.classifierSession].filter(
			(session): session is ort.InferenceSession => session !== undefined
		);
		await Promise.all(sessions.map((session) => session.release()));
		this.embeddingSession = undefined;
		this.classifierSession = undefined;
		this.tokenizer = undefined;
		this.status = "closed";
	}

	private async loadModels(): Promise<void> {
		let embeddingSession: ort.InferenceSession | undefined;
		let classifierSession: ort.InferenceSession | undefined;
		try {
			await this.verifyModelFiles();
			const tokenizer = await AutoTokenizer.from_pretrained(this.config.tokenizerPath, {
				local_files_only: true,
			});
			embeddingSession = await ort.InferenceSession.create(this.config.embeddingModelPath, {
				executionProviders: ["cpu"],
			});
			classifierSession = await ort.InferenceSession.create(this.config.classifierModelPath, {
				executionProviders: ["cpu"],
			});
			this.validateModelMetadata(embeddingSession, classifierSession);
			this.tokenizer = tokenizer;
			this.embeddingSession = embeddingSession;
			this.classifierSession = classifierSession;
			if (this.status !== "closing") this.status = "ready";
		} catch (error) {
			await Promise.all(
				[embeddingSession, classifierSession]
					.filter((session): session is ort.InferenceSession => session !== undefined)
					.map((session) => session.release())
			);
			const inferenceError =
				error instanceof InferenceError
					? error
					: new InferenceError("MODEL_UNAVAILABLE", messageOf(error), { cause: error });
			this.lastError = inferenceError.message;
			if (this.status !== "closing") this.status = "failed";
			throw inferenceError;
		}
	}

	private async verifyModelFiles(): Promise<void> {
		await this.verifyHash(
			this.config.embeddingModelPath,
			AKARI_MODEL_MANIFEST.embedding.sha256,
			"embedding model"
		);
		await this.verifyHash(
			this.config.classifierModelPath,
			AKARI_MODEL_MANIFEST.classifier.sha256,
			"classifier model"
		);
		for (const [fileName, expectedHash] of Object.entries(
			AKARI_MODEL_MANIFEST.tokenizer.files
		)) {
			await this.verifyHash(
				path.join(this.config.tokenizerPath, fileName),
				expectedHash,
				`tokenizer asset ${fileName}`
			);
		}
	}

	private async verifyHash(filePath: string, expectedHash: string, name: string): Promise<void> {
		try {
			await access(filePath);
			const actualHash = await hashFile(filePath);
			if (actualHash !== expectedHash) {
				throw new InferenceError(
					"MODEL_INTEGRITY",
					`${name} hash does not match the pinned manifest.`
				);
			}
		} catch (error) {
			if (error instanceof InferenceError) throw error;
			throw new InferenceError(
				"MODEL_UNAVAILABLE",
				`${name} is unavailable at ${filePath}.`,
				{
					cause: error,
				}
			);
		}
	}

	private validateModelMetadata(
		embeddingSession: ort.InferenceSession,
		classifierSession: ort.InferenceSession
	): void {
		const embeddingOutput = embeddingSession.outputMetadata[0];
		const classifierInput = classifierSession.inputMetadata[0];
		const classifierOutput = classifierSession.outputMetadata[0];
		const embeddingInputMetadata = embeddingSession.inputMetadata;
		const validEmbeddingOutput =
			embeddingOutput?.isTensor &&
			embeddingOutput.type === "float32" &&
			embeddingOutput.shape.length === 2;
		const validClassifierInput =
			classifierInput?.isTensor &&
			classifierInput.type === "float32" &&
			classifierInput.shape.length === 3 &&
			classifierInput.shape[1] === AKARI_MODEL_MANIFEST.classifier.featureRows &&
			classifierInput.shape[2] === AKARI_MODEL_MANIFEST.classifier.featureWidth;
		const validClassifierOutput =
			classifierOutput?.isTensor &&
			classifierOutput.type === "float32" &&
			classifierOutput.shape.length === 2 &&
			classifierOutput.shape[1] === AKARI_MODEL_MANIFEST.classifier.labelCount;
		if (
			!sameStrings(embeddingSession.inputNames, AKARI_MODEL_MANIFEST.embedding.inputNames) ||
			!sameStrings(embeddingSession.outputNames, [
				AKARI_MODEL_MANIFEST.embedding.outputName,
			]) ||
			!sameStrings(classifierSession.inputNames, [
				AKARI_MODEL_MANIFEST.classifier.inputName,
			]) ||
			!sameStrings(classifierSession.outputNames, [
				AKARI_MODEL_MANIFEST.classifier.outputName,
			]) ||
			embeddingInputMetadata.length !== 2 ||
			embeddingInputMetadata.some(
				(metadata) =>
					!metadata.isTensor || metadata.type !== "int64" || metadata.shape.length !== 1
			) ||
			!validEmbeddingOutput ||
			!validClassifierInput ||
			!validClassifierOutput
		) {
			throw new InferenceError(
				"MODEL_DIMENSION",
				"ONNX model metadata does not match the pinned manifest."
			);
		}
	}

	private assertReady(): void {
		if (this.status !== "ready") {
			const code =
				this.status === "closing" || this.status === "closed" ? "CLOSING" : "NOT_READY";
			throw new InferenceError(code, `Inference engine is ${this.status}.`);
		}
	}

	private validateInput(input: ClassifyVideoInput): void {
		if (
			input === undefined ||
			typeof input.title !== "string" ||
			typeof input.description !== "string" ||
			!Array.isArray(input.tags) ||
			!input.tags.every((tag) => typeof tag === "string")
		) {
			throw new InferenceError(
				"INVALID_INPUT",
				"title, description, and tags must be strings."
			);
		}
		if (
			input.title.trim().length +
				input.description.trim().length +
				input.tags.join(" ").trim().length ===
			0
		) {
			throw new InferenceError("INVALID_INPUT", "At least one text field must contain text.");
		}
	}

	private async classifyOne(input: ClassifyVideoInput): Promise<ClassifyVideoResult> {
		const tokenizer = this.tokenizer;
		const embeddingSession = this.embeddingSession;
		const classifierSession = this.classifierSession;
		if (!tokenizer || !embeddingSession || !classifierSession) {
			throw new InferenceError("NOT_READY", "Inference assets are not loaded.");
		}

		const { input_ids: inputIds } = await tokenizer(
			[
				normalizeText(input.title, "untitled"),
				normalizeText(input.description, "N/A"),
				normalizeText(input.tags.join(" "), "empty"),
			],
			{ add_special_tokens: false, return_tensor: false }
		);
		const tokenCount = inputIds.reduce((total, row) => total + row.length, 0);
		validateTokenCount(tokenCount, this.limits.maxInputTokens);
		if (tokenCount === 0) {
			throw new InferenceError(
				"INVALID_INPUT",
				"Tokenizer produced no tokens for the input."
			);
		}
		if (inputIds.length !== AKARI_MODEL_MANIFEST.classifier.featureRows) {
			throw new InferenceError(
				"MODEL_DIMENSION",
				"Tokenizer did not produce three text channels."
			);
		}
		const offsets = [0];
		for (const row of inputIds.slice(0, -1)) {
			offsets.push(offsets[offsets.length - 1] + row.length);
		}
		const flattenedInputIds = inputIds.flat();
		const embeddingOutputs = await embeddingSession.run({
			input_ids: new ort.Tensor(
				"int64",
				new BigInt64Array(flattenedInputIds.map((tokenId) => BigInt(tokenId))),
				[flattenedInputIds.length]
			),
			offsets: new ort.Tensor(
				"int64",
				new BigInt64Array(offsets.map((offset) => BigInt(offset))),
				[offsets.length]
			),
		});
		const embeddings = embeddingOutputs[AKARI_MODEL_MANIFEST.embedding.outputName];
		if (
			embeddings?.type !== "float32" ||
			embeddings.dims.length !== 2 ||
			embeddings.dims[0] !== AKARI_MODEL_MANIFEST.embedding.featureRows ||
			embeddings.dims[1] !== AKARI_MODEL_MANIFEST.embedding.featureWidth ||
			!(embeddings.data instanceof Float32Array)
		) {
			throw new InferenceError(
				"MODEL_DIMENSION",
				"Embedding output does not match [3, 1024] float32."
			);
		}
		validateFeatureShape(embeddings.data);
		const classificationOutputs = await classifierSession.run({
			channel_features: new ort.Tensor(embeddings.data, [1, 3, 1024]),
		});
		const logits = classificationOutputs[AKARI_MODEL_MANIFEST.classifier.outputName];
		if (
			logits?.type !== "float32" ||
			logits.dims.length !== 2 ||
			logits.dims[0] !== 1 ||
			logits.dims[1] !== AKARI_MODEL_MANIFEST.classifier.labelCount ||
			!(logits.data instanceof Float32Array)
		) {
			throw new InferenceError(
				"MODEL_DIMENSION",
				"Classifier output does not match [1, 3] float32."
			);
		}
		const probabilities = softmax(logits.data);
		const label = probabilities.indexOf(Math.max(...probabilities));
		return {
			label,
			probabilities,
			accepted: label !== AKARI_MODEL_MANIFEST.classifier.rejectLabel,
			modelVersion: AKARI_MODEL_MANIFEST.modelVersion,
		};
	}
}

async function hashFile(filePath: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(filePath)) hash.update(chunk);
	return hash.digest("hex");
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
	return (
		actual.length === expected.length &&
		actual.every((value, index) => value === expected[index])
	);
}

function softmax(logits: Float32Array): ClassifyVideoResult["probabilities"] {
	if (logits.length !== AKARI_MODEL_MANIFEST.classifier.labelCount) {
		throw new InferenceError(
			"MODEL_DIMENSION",
			"Classifier returned an unexpected number of logits."
		);
	}
	for (const logit of logits) {
		if (!Number.isFinite(logit)) {
			throw new InferenceError("MODEL_DIMENSION", "Classifier returned a non-finite logit.");
		}
	}
	const maximum = Math.max(...logits);
	const exponentials = Array.from(logits, (logit) => Math.exp(logit - maximum));
	const sum = exponentials.reduce((total, value) => total + value, 0);
	return [
		(exponentials[0] ?? 0) / sum,
		(exponentials[1] ?? 0) / sum,
		(exponentials[2] ?? 0) / sum,
	];
}

function normalizeText(value: string, fallback: string): string {
	return value.trim() || fallback;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
