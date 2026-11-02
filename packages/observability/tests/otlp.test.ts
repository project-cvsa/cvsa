import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { metrics } from "@opentelemetry/api";
import { initOtelSdk } from "../src/init";

let server: Server | undefined;
let sdk: Awaited<ReturnType<typeof initOtelSdk>> | undefined;

afterEach(async () => {
	await sdk?.shutdown();
	sdk = undefined;
	metrics.disable();
	await new Promise<void>((resolve) => {
		if (!server) return resolve();
		server.close(() => resolve());
	});
	server = undefined;
});

describe("OTLP metric export", () => {
	test("sends a real protobuf request with the crawler instance, metric name and dimensions", async () => {
		let body = Buffer.alloc(0);
		let path = "";
		let contentType = "";
		server = createServer((request, response) => {
			const chunks: Buffer[] = [];
			request.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
			request.on("end", () => {
				body = Buffer.concat(chunks);
				path = request.url ?? "";
				contentType = String(request.headers["content-type"] ?? "");
				response.writeHead(200, { "content-type": "application/x-protobuf" });
				response.end();
			});
		});
		const port = await new Promise<number>((resolve) => {
			server?.listen(0, "127.0.0.1", () => {
				const address = server?.address();
				resolve(typeof address === "object" && address ? address.port : 0);
			});
		});
		const exports: Array<{ success: boolean; durationMs: number }> = [];
		sdk = await initOtelSdk({
			serviceName: "cvsa-crawler-test",
			serviceInstanceId: "otlp-instance-test",
			otlpEndpoint: `http://127.0.0.1:${port}`,
			onMetricExport: (result) => exports.push(result),
		});
		const histogram = metrics
			.getMeter("cvsa-crawler")
			.createHistogram("cvsa.crawler.duration_ms", { unit: "ms" });
		histogram.record(42, { operation: "trackingExecution", outcome: "success" });

		await sdk.shutdown();

		const text = body.toString("utf8");
		expect(path).toBe("/v1/metrics");
		expect(contentType).toContain("protobuf");
		expect(text).toContain("cvsa.crawler.duration_ms");
		expect(text).toContain("trackingExecution");
		expect(text).toContain("success");
		expect(text).toContain("otlp-instance-test");
		expect(exports.some((item) => item.success && item.durationMs >= 0)).toBe(true);
	});
});
