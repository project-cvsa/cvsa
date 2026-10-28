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
				egress: "direct",
			},
		]);
		expect(sink.durations).toHaveLength(1);
		expect(sink.durations[0]?.value).toBe(42);
		expect(sink.durations[0]?.attributes.outcome).toBe("success");
		expect(sink.inFlight).toEqual([1, -1]);
	});

	test("labels egress as proxy for a proxied adapter", () => {
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
			egress: "proxy",
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
