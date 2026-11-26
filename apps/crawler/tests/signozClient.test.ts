import { describe, expect, test } from "bun:test";
import { pickSigNozStep, SigNozMetricsClient } from "../src/crawler/stats/signozClient";

describe("SigNozMetricsClient", () => {
	test("returns empty array when endpoint is not configured", async () => {
		const client = new SigNozMetricsClient();
		expect(client.isConfigured).toBe(false);
		const result = await client.queryRange("up", 1000, 2000, 15);
		expect(result).toEqual([]);
		const series = await client.queryCrawlerSeries(1000_000, 2000_000, 5);
		expect(series).toBeNull();
	});

	test("pickSigNozStep returns appropriate step seconds based on duration", () => {
		expect(pickSigNozStep(5)).toBe(5);
		expect(pickSigNozStep(15)).toBe(15);
		expect(pickSigNozStep(30)).toBe(30);
		expect(pickSigNozStep(60)).toBe(60);
		expect(pickSigNozStep(360)).toBe(120);
		expect(pickSigNozStep(1440)).toBe(300);
		expect(pickSigNozStep(10080)).toBe(1800);
	});

	test("queries Prometheus HTTP range endpoint with correct params and headers", async () => {
		let requestedUrl = "";
		let requestedHeaders: Record<string, string> = {};

		const server = Bun.serve({
			port: 0,
			fetch(req) {
				requestedUrl = req.url;
				requestedHeaders = Object.fromEntries(req.headers.entries());
				return Response.json({
					status: "success",
					data: {
						resultType: "matrix",
						result: [
							{
								metric: { __name__: "test_metric" },
								values: [
									[1000, "42"],
									[1015, "48"],
								],
							},
						],
					},
				});
			},
		});

		try {
			const client = new SigNozMetricsClient({
				endpoint: `http://localhost:${server.port}`,
				apiKey: "test-signoz-key",
			});
			expect(client.isConfigured).toBe(true);

			const result = await client.queryRange("test_metric", 1000, 2000, 15);
			expect(result).toHaveLength(1);
			expect(result[0]?.values).toHaveLength(2);
			expect(result[0]?.values[0]).toEqual([1000, "42"]);

			const parsedUrl = new URL(requestedUrl);
			expect(parsedUrl.pathname).toBe("/api/v1/query_range");
			expect(parsedUrl.searchParams.get("query")).toBe("test_metric");
			expect(parsedUrl.searchParams.get("start")).toBe("1000");
			expect(parsedUrl.searchParams.get("end")).toBe("2000");
			expect(parsedUrl.searchParams.get("step")).toBe("15s");
			expect(requestedHeaders["signoz-api-key"]).toBe("test-signoz-key");
		} finally {
			server.stop();
		}
	});

	test("queryCrawlerSeries queries PromQL metrics and stitches series points", async () => {
		const server = Bun.serve({
			port: 0,
			fetch() {
				return Response.json({
					status: "success",
					data: {
						resultType: "matrix",
						result: [
							{
								metric: {},
								values: [
									[1000, "120"],
									[1005, "130"],
								],
							},
						],
					},
				});
			},
		});

		try {
			const client = new SigNozMetricsClient({
				endpoint: `http://localhost:${server.port}`,
			});
			const series = await client.queryCrawlerSeries(1000_000, 1005_000, 5);
			expect(series).not.toBeNull();
			expect(series).toHaveLength(2);
			expect(series?.[0]?.bucketTime).toBe(new Date(1000 * 1000).toISOString());
			expect(series?.[0]?.metrics.videosPerMin).toBe(120);
		} finally {
			server.stop();
		}
	});

	test("handles upstream HTTP error responses gracefully by throwing", async () => {
		const server = Bun.serve({
			port: 0,
			fetch() {
				return new Response("Unauthorized", { status: 401 });
			},
		});

		try {
			const client = new SigNozMetricsClient({
				endpoint: `http://localhost:${server.port}`,
			});
			await expect(client.queryRange("up", 1000, 2000, 15)).rejects.toThrow(
				"SigNoz query_range failed: 401"
			);
		} finally {
			server.stop();
		}
	});
});
