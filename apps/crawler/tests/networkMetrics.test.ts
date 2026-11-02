import {
	NetworkScheduler,
	CrawlerExecutionConfigSchema,
	type NetworkAdapter,
} from "@cvsa/network-scheduler";
import { FakeRateLimiter } from "@cvsa/network-scheduler/testing";
import { createNetworkMetrics } from "../src/crawler/network/telemetry";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import { describe, expect, test } from "bun:test";
import type { NetworkTransportResponse } from "@cvsa/network-scheduler";
import type { NetworkMetricAttributes } from "@cvsa/network-scheduler";
import {
	createNetworkRequestMetricRecorder,
	networkRequestOutcome,
	parseNetworkRequestOutcome,
	type NetworkRequestMetricSink,
} from "../src/crawler/network/requestMetrics";

function response(overrides: Partial<NetworkTransportResponse> = {}): NetworkTransportResponse {
	return {
		status: 200,
		headers: {},
		body: "",
		durationMs: 12,
		...overrides,
	};
}

class RecordingSink implements NetworkRequestMetricSink {
	readonly started: NetworkMetricAttributes[] = [];
	readonly durations: Array<{ value: number; attributes: NetworkMetricAttributes }> = [];
	readonly inFlight: number[] = [];

	requestStarted(attributes: NetworkMetricAttributes): void {
		this.started.push(attributes);
	}

	requestDurationMs(value: number, attributes: NetworkMetricAttributes): void {
		this.durations.push({ value, attributes });
	}

	requestsInFlight(delta: number, _attributes: NetworkMetricAttributes): void {
		this.inFlight.push(delta);
	}
}

describe("networkRequestOutcome", () => {
	test("maps transport error codes onto outcomes", () => {
		expect(networkRequestOutcome(response())).toBe("success");
		expect(networkRequestOutcome(response({ errorCode: "REQUEST_TIMEOUT" }))).toBe("timeout");
		expect(networkRequestOutcome(response({ errorCode: "NETWORK_FAILURE" }))).toBe(
			"connection_error"
		);
		expect(networkRequestOutcome(response({ errorCode: "APPLICATION_ERROR" }))).toBe(
			"business_error"
		);
		expect(networkRequestOutcome(response({ errorCode: "HTTP_5XX", status: 503 }))).toBe(
			"http_error"
		);
	});

	test("treats 412 and 429 as rate limiting, not business errors", () => {
		expect(
			networkRequestOutcome(response({ errorCode: "APPLICATION_RATE_LIMIT", status: 200 }))
		).toBe("rate_limited");
		expect(networkRequestOutcome(response({ errorCode: "HTTP_4XX", status: 412 }))).toBe(
			"rate_limited"
		);
		expect(networkRequestOutcome(response({ errorCode: "HTTP_4XX", status: 429 }))).toBe(
			"rate_limited"
		);
		expect(networkRequestOutcome(response({ errorCode: "RATE_LIMITED", status: 429 }))).toBe(
			"rate_limited"
		);
	});

	test("parses outcomes off metric attributes defensively", () => {
		expect(parseNetworkRequestOutcome("timeout")).toBe("timeout");
		expect(parseNetworkRequestOutcome("rate_limited")).toBe("rate_limited");
		expect(parseNetworkRequestOutcome(undefined)).toBe("other_error");
		expect(parseNetworkRequestOutcome("nonsense")).toBe("other_error");
	});
});

describe("createNetworkRequestMetricRecorder", () => {
	test("emits start, duration, and in-flight lifecycle events", () => {
		const sink = new RecordingSink();
		let clock = 1_000;
		const recorder = createNetworkRequestMetricRecorder(sink, () => clock);

		const observer = recorder.createAttemptObserver({
			request: { url: "https://api.bilibili.com/x/web-interface/view?aid=1" },
			adapterId: "direct-a",
			adapterType: "direct",
		});

		observer.started();
		clock += 42;
		observer.completed(response());

		expect(sink.started).toEqual([
			{
				requestType: "default",
				endpoint: "video_view",
				egress: "direct-a",
				retry: 0,
			},
		]);
		expect(sink.durations).toHaveLength(1);
		expect(sink.durations[0]?.value).toBe(42);
		expect(sink.durations[0]?.attributes.outcome).toBe("success");
		expect(sink.inFlight).toEqual([1, -1]);
	});

	test("labels requests by the specific egress adapter", () => {
		const sink = new RecordingSink();
		const recorder = createNetworkRequestMetricRecorder(sink, () => 0);

		recorder
			.createAttemptObserver({
				request: {
					url: "https://api.bilibili.com/x/web-interface/wbi/search/type",
					requestType: "bilibili-api",
				},
				adapterId: "proxy-a",
				adapterType: "http-proxy",
			})
			.started();

		expect(sink.started[0]).toEqual({
			requestType: "bilibili-api",
			endpoint: "video_search",
			egress: "proxy-a",
			retry: 0,
		});
	});

	test("is idempotent: a duplicate completion cannot double count", () => {
		const sink = new RecordingSink();
		let clock = 0;
		const observer = createNetworkRequestMetricRecorder(
			sink,
			() => clock
		).createAttemptObserver({
			request: { url: "https://api.bilibili.com/unknown" },
			adapterId: "direct-a",
			adapterType: "direct",
		});

		observer.started();
		observer.started();
		clock = 10;
		observer.completed(response());
		observer.completed(response());

		expect(sink.started).toHaveLength(1);
		expect(sink.durations).toHaveLength(1);
		expect(sink.inFlight).toEqual([1, -1]);
		expect(sink.started[0]?.endpoint).toBe("other");
	});
});

describe("scheduler request metrics", () => {
	test("records real retry attempts and request results by endpoint and egress", async () => {
		const stats = new CrawlerStatsCollector();
		const metrics = createNetworkMetrics({
			onRequestFinishedWithAttributes(ms, outcome, attributes) {
				stats.recordNetworkRequest(ms, outcome, attributes);
				if (attributes.retry === 1) stats.recordRetry();
			},
		});
		const failing: NetworkAdapter = {
			id: "direct-a",
			async execute(_request, observer) {
				observer?.started();
				const result = {
					...response({ status: 503, errorCode: "NETWORK_FAILURE" }),
					adapterId: "direct-a",
				};
				observer?.completed(result);
				return result;
			},
		};
		const succeeding: NetworkAdapter = {
			id: "direct-b",
			async execute(_request, observer) {
				observer?.started();
				const result = { ...response(), adapterId: "direct-b" };
				observer?.completed(result);
				return result;
			},
		};
		const scheduler = new NetworkScheduler(
			{
				adapters: ["direct-a", "direct-b"].map((id) => ({
					id,
					type: "direct",
					enabled: true,
					baseWeight: 1,
					rateLimits: [],
				})),
				bindings: [
					{ requestType: "bilibili:tracking", adapterIds: ["direct-a", "direct-b"] },
				],
				requestTypePolicies: {},
				execution: CrawlerExecutionConfigSchema.parse({}),
			},
			new Map([
				[failing.id, failing],
				[succeeding.id, succeeding],
			]),
			new FakeRateLimiter(),
			{ metrics, random: () => 0 }
		);
		await scheduler.execute({
			url: "https://api.bilibili.com/medialist/gateway/base/resource/infos",
			requestType: "bilibili:tracking",
		});
		const report = await stats.getReport("5m");
		expect(report.metrics.counters.networkRequests).toBe(2);
		expect(report.metrics.retries).toBe(1);
		expect(report.metrics.network["egress:direct-a"]).toMatchObject({
			requests: 1,
			transportFailures: 1,
		});
		expect(report.metrics.network["egress:direct-b"]).toMatchObject({
			requests: 1,
			success: 1,
		});
		expect(report.metrics.network["endpoint:video_stats"]?.requests).toBe(2);
	});
});
