import { afterEach, describe, expect, test } from "bun:test";
import { diag, metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { initOtelSdk } from "../src/init";
import { createMetricInstruments } from "../src/metrics";

const originalMetricsEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
const originalMetricsExporter = process.env.OTEL_METRICS_EXPORTER;
afterEach(() => {
	metrics.disable();
	diag.disable();
	trace.disable();
	logs.disable();
	if (originalMetricsEndpoint === undefined)
		delete process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
	else process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = originalMetricsEndpoint;
	if (originalMetricsExporter === undefined) delete process.env.OTEL_METRICS_EXPORTER;
	else process.env.OTEL_METRICS_EXPORTER = originalMetricsExporter;
});

describe.serial("initOtelSdk", () => {
	test("exports observations from a recorder created before SDK initialization to the metrics signal endpoint", async () => {
		const requests: Array<{ path: string; contentType: string | null; body: Uint8Array }> = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				requests.push({
					path: new URL(request.url).pathname,
					contentType: request.headers.get("content-type"),
					body: new Uint8Array(await request.arrayBuffer()),
				});
				return new Response(new Uint8Array(), {
					headers: { "content-type": "application/x-protobuf" },
				});
			},
		});
		const instruments = createMetricInstruments("test-scope", (meter) => ({
			counter: meter.createCounter("test.observability.events"),
		}));
		instruments().counter.add(1);
		const sdk = await initOtelSdk({
			serviceName: "test-crawler-export",
			nodeEnv: "test",
			otlpEndpoint: `${server.url}v1/traces`,
		});
		try {
			instruments().counter.add(3, { kind: "saved" });
			await sdk.shutdown();
			const exported = requests.filter((request) => request.path === "/v1/metrics");
			expect(exported).toHaveLength(1);
			expect(exported[0]?.contentType).toBe("application/x-protobuf");
			const body = Buffer.from(exported[0]?.body ?? new Uint8Array());
			expect(body.includes(Buffer.from("test.observability.events"))).toBe(true);
			expect(body.includes(Buffer.from("test-crawler-export"))).toBe(true);
			expect(body.includes(Buffer.from("saved"))).toBe(true);
		} finally {
			await sdk.shutdown();
			await server.stop(true);
		}
	});

	test("leaves exporters disabled when the general endpoint is absent, even if SDK exporter defaults are enabled", async () => {
		const requests: string[] = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				requests.push(request.url);
				return new Response(new Uint8Array());
			},
		});
		process.env.OTEL_METRICS_EXPORTER = "otlp";
		process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = `${server.url}v1/metrics`;
		const sdk = await initOtelSdk({ otlpEndpoint: "", serviceName: "test-disabled" });
		try {
			metrics.getMeter("disabled-scope").createCounter("test.disabled.events").add(1);
			await sdk.shutdown();
			expect(requests).toEqual([]);
		} finally {
			await sdk.shutdown();
			await server.stop(true);
		}
	});
});
