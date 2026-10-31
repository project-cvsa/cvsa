import { describe, expect, test } from "bun:test";
import { initOtelSdk } from "../src/init";

describe("initOtelSdk", () => {
	test("initializes sdk with resolved signal endpoints when endpoint is configured", async () => {
		const sdk = await initOtelSdk({
			serviceName: "test-service",
			serviceVersion: "1.0.0",
			nodeEnv: "test",
			otlpEndpoint: "http://127.0.0.1:4318",
		});
		expect(sdk).toBeDefined();
		await sdk.shutdown();
	});

	test("initializes sdk cleanly when endpoint is omitted", async () => {
		const sdk = await initOtelSdk({
			serviceName: "test-service",
			serviceVersion: "1.0.0",
			nodeEnv: "test",
			otlpEndpoint: undefined,
		});
		expect(sdk).toBeDefined();
		await sdk.shutdown();
	});
});
