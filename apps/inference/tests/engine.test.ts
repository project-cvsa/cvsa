import { strict as assert } from "node:assert";
import { test } from "bun:test";
import {
	BoundedInferenceExecutor,
	InferenceEngine,
	InferenceError,
	validateFeatureShape,
	validateTokenCount,
	type InferenceEngineConfig,
} from "../src";
import type { ClassifyVideoInput } from "../src/types";

const fixedInput: ClassifyVideoInput = {
	title: "中文歌声合成搬运",
	description: "初音未来 covers",
	tags: ["VOCALOID"],
};

const realModelConfig = readRealModelConfig();

if (realModelConfig) {
	test("real ONNX assets classify a fixed example and preserve batch order", async () => {
		const engine = new InferenceEngine(realModelConfig);
		const inputs: ClassifyVideoInput[] = [
			fixedInput,
			{
				title: "初音ミク オリジナル曲",
				description: "VOCALOID original song",
				tags: ["初音ミク", "VOCALOID"],
			},
			{
				title: "歌ってみた",
				description: "カバー動画",
				tags: ["cover", "singing"],
			},
		];

		try {
			await engine.initialize();
			assert.equal(engine.getHealth().ready, true);

			const fixedPrediction = await engine.classify(fixedInput);
			assert.equal(fixedPrediction.label, 0);
			assert.equal(fixedPrediction.accepted, false);
			assert.equal(fixedPrediction.modelVersion, "akari-3.17");
			assert.equal(fixedPrediction.probabilities.length, 3);
			assert.ok(
				Math.abs(fixedPrediction.probabilities.reduce((sum, value) => sum + value, 0) - 1) <
					1e-6
			);

			const expected = await Promise.all(inputs.map((input) => engine.classify(input)));
			const actual = await engine.classifyBatch(inputs);
			assert.equal(actual.length, inputs.length);
			for (const [index, prediction] of actual.entries()) {
				const expectedPrediction = expected[index];
				assert.ok(expectedPrediction);
				assert.equal(prediction.label, expectedPrediction.label);
				assert.equal(prediction.accepted, expectedPrediction.accepted);
				assert.equal(prediction.modelVersion, expectedPrediction.modelVersion);
				assert.equal(
					prediction.probabilities.length,
					expectedPrediction.probabilities.length
				);
				for (const [probabilityIndex, probability] of prediction.probabilities.entries()) {
					const expectedProbability = expectedPrediction.probabilities[probabilityIndex];
					assert.ok(expectedProbability !== undefined);
					assert.ok(Math.abs(probability - expectedProbability) < 1e-6);
				}
			}
		} finally {
			await engine.close();
		}
	});
} else {
	test.skip("real ONNX assets classify a fixed example and preserve batch order", () => {});
}

test("missing local model assets leave the engine unhealthy and report failure", async () => {
	const engine = new InferenceEngine({
		embeddingModelPath: "/missing/cvsa/inference/model.onnx",
		classifierModelPath: "/missing/cvsa/inference/3.17.onnx",
		tokenizerPath: "/missing/cvsa/inference/tokenizer",
	});

	await assert.rejects(engine.initialize(), (error: unknown) => {
		assert.ok(error instanceof InferenceError);
		assert.equal(error.code, "MODEL_UNAVAILABLE");
		return true;
	});
	assert.equal(engine.getHealth().ready, false);
	assert.equal(engine.getDiagnostics().status, "failed");
	await engine.close();
	assert.equal(engine.getDiagnostics().status, "closed");
});

test("feature dimensions and input token limits are enforced", () => {
	assert.throws(
		() => validateFeatureShape(new Float32Array(3 * 1024 - 1)),
		(error: unknown) => {
			assert.ok(error instanceof InferenceError);
			assert.equal(error.code, "MODEL_DIMENSION");
			return true;
		}
	);
	assert.throws(
		() => validateTokenCount(5, 4),
		(error: unknown) => {
			assert.ok(error instanceof InferenceError);
			assert.equal(error.code, "INPUT_TOO_LONG");
			return true;
		}
	);
	assert.doesNotThrow(() => validateFeatureShape(new Float32Array(3 * 1024)));
	assert.doesNotThrow(() => validateTokenCount(4, 4));
});

test("bounded executor enforces concurrency and queue limits, then drains on close", async () => {
	const executor = new BoundedInferenceExecutor(1, 1);
	let releaseFirst: () => void = () => {};
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const first = executor.submit(async () => {
		await firstGate;
		return "first";
	});
	const second = executor.submit(async () => "second");
	const overflow = executor.submit(async () => "overflow");

	assert.equal(executor.activeRequests, 1);
	assert.equal(executor.queuedRequests, 1);
	await assert.rejects(overflow, (error: unknown) => {
		assert.ok(error instanceof InferenceError);
		assert.equal(error.code, "OVERLOADED");
		return true;
	});

	executor.stopAccepting();
	const closingRequest = executor.submit(async () => "closed");
	await assert.rejects(closingRequest, (error: unknown) => {
		assert.ok(error instanceof InferenceError);
		assert.equal(error.code, "CLOSING");
		return true;
	});

	let drained = false;
	const draining = executor.drain().then(() => {
		drained = true;
	});
	assert.equal(drained, false);
	releaseFirst();
	assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
	await draining;
	assert.equal(drained, true);
	assert.equal(executor.activeRequests, 0);
	assert.equal(executor.queuedRequests, 0);
});

function readRealModelConfig(): InferenceEngineConfig | undefined {
	const embeddingModelPath = process.env.CVSA_INFERENCE_TEST_EMBEDDING_MODEL;
	const classifierModelPath = process.env.CVSA_INFERENCE_TEST_CLASSIFIER_MODEL;
	const tokenizerPath = process.env.CVSA_INFERENCE_TEST_TOKENIZER_PATH;
	if (!embeddingModelPath || !classifierModelPath || !tokenizerPath) return undefined;
	return { embeddingModelPath, classifierModelPath, tokenizerPath };
}
