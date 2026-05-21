import path from "node:path";
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";
import { fileDownloadInfo } from "@huggingface/hub";
import * as ort from "onnxruntime-node";
import { appLogger } from "@cvsa/logger";

const modelDir = path.join(import.meta.dir, "../../../model/");

// TODO: More formalized config
const modelName = "alikia2x/potion-multilingual-128M-int8-strip";
const modelPath = path.join(modelDir, "./potion-strip/model.onnx");

export class EmbeddingManager {
	private tokenizer: PreTrainedTokenizer | null = null;
	private session: ort.InferenceSession | null = null;

	public async init(): Promise<boolean> {
		try {
			await this.downloadModel();
			await this.initTokenizer();
			await this.initSession();
			return true;
		} catch (e) {
			appLogger.error(Bun.inspect(e));
			return false;
		}
	}

	private async initTokenizer(): Promise<void> {
		if (this.tokenizer !== null) {
			return;
		}
		this.tokenizer = await AutoTokenizer.from_pretrained(modelName);
	}

	private async initSession(): Promise<void> {
		if (this.session !== null) {
			return;
		}
		this.session = await ort.InferenceSession.create(modelPath);
	}

	private async getTokenizer(): Promise<PreTrainedTokenizer> {
		if (this.tokenizer === null) {
			this.tokenizer = await AutoTokenizer.from_pretrained(modelName);
		}
		return this.tokenizer;
	}

	private async getModelSession(): Promise<ort.InferenceSession> {
		if (this.session === null) {
			this.session = await ort.InferenceSession.create(modelPath);
		}
		return this.session;
	}

	private reshape(data: Float16Array, shape: number[]) {
		const [rows, cols] = shape;
		const result = [];

		for (let i = 0; i < rows; i++) {
			const start = i * cols;
			const end = start + cols;

			result.push(Array.from(data.subarray(start, end)));
		}

		return result;
	}

	private async downloadModel() {
		const modelFile = Bun.file(modelPath);
		if (await modelFile.exists()) {
			return;
		}
		appLogger.info("Downloading embedding model...");

		const info = await fileDownloadInfo({
			repo: modelName,
			path: "onnx/model.onnx",
		});

		if (!info) {
			appLogger.error("Cannot get download info for model file.");
			return;
		}

		const { url, size } = info;
		let downloaded = 0;

		const response = await fetch(url);
		if (!response.ok) {
			appLogger.error(`Failed to download model: ${response.status} ${response.statusText}`);
			return;
		}

		if (!response.body) {
			appLogger.error("Response body is null");
			return;
		}

		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			downloaded += value.byteLength;
			const percent = size > 0 ? Math.round((downloaded / size) * 100) : 0;
			appLogger.info(`Embedding model download: ${percent}% (${downloaded}/${size} bytes)`);
			chunks.push(value);
		}

		const buffer = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			buffer.set(chunk, offset);
			offset += chunk.byteLength;
		}

		await Bun.write(modelFile, buffer);
		appLogger.info("Embedding model downloaded.");
	}

	public async getEmbedding(texts: string[]): Promise<number[][]> {
		const tokenizer = await this.getTokenizer();
		const session = await this.getModelSession();

		const { input_ids } = tokenizer(texts, {
			add_special_tokens: false,
			return_tensor: false,
		});

		const cumsum = (arr: number[]): number[] => {
			const result: number[] = new Array(arr.length);
			let currentSum = 0;
			for (let i = 0; i < arr.length; i++) {
				currentSum += arr[i];
				result[i] = currentSum;
			}
			return result;
		};

		const offsets: number[] = [
			0,
			...cumsum(input_ids.slice(0, -1).map((x: number[]) => x.length)),
		];
		const flattened_input_ids = input_ids.flat();

		const inputs = {
			input_ids: new ort.Tensor("int64", new BigInt64Array(flattened_input_ids.map(BigInt)), [
				flattened_input_ids.length,
			]),
			offsets: new ort.Tensor("int64", new BigInt64Array(offsets.map(BigInt)), [
				offsets.length,
			]),
		};

		const { embeddings } = await session.run(inputs);
		return this.reshape(embeddings.data as unknown as Float16Array, [...embeddings.dims]);
	}
}

const manager = new EmbeddingManager();
const success = await manager.init();
export const embeddingManager = success ? manager : undefined;
