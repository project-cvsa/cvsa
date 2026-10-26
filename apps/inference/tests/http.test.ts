import { strict as assert } from "node:assert";
import { test } from "bun:test";
import { createInferenceApp, InferenceEngine } from "../src";

test("HTTP routes expose health, readiness, and contract validation", async () => {
	const engine = new InferenceEngine({
		embeddingModelPath: "/missing/cvsa/inference/model.onnx",
		classifierModelPath: "/missing/cvsa/inference/3.17.onnx",
		tokenizerPath: "/missing/cvsa/inference/tokenizer",
	});
	const app = createInferenceApp(engine);

	const healthResponse = await app.handle(new Request("http://localhost/health"));
	assert.equal(healthResponse.status, 200);
	assert.deepEqual(await healthResponse.json(), { ready: false });

	const readinessResponse = await app.handle(new Request("http://localhost/ready"));
	assert.equal(readinessResponse.status, 503);
	assert.deepEqual(await readinessResponse.json(), { ready: false });

	const invalidInputResponse = await app.handle(
		new Request("http://localhost/classify", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: "VOCALOID", description: "", tags: "wrong-shape" }),
		})
	);
	assert.equal(invalidInputResponse.status, 400);

	const notReadyResponse = await app.handle(
		new Request("http://localhost/classify", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: "VOCALOID", description: "", tags: ["cover"] }),
		})
	);
	assert.equal(notReadyResponse.status, 503);
	assert.deepEqual(await notReadyResponse.json(), {
		code: "not_ready",
		message: "Inference engine is starting.",
	});

	const invalidBatchResponse = await app.handle(
		new Request("http://localhost/batch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify([]),
		})
	);
	assert.equal(invalidBatchResponse.status, 400);
	await engine.close();
});
