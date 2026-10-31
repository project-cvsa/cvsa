import type {
	NetworkAttemptContext,
	NetworkAttemptObserver,
	NetworkMetricAttributes,
	NetworkTransportResponse,
} from "@cvsa/network-scheduler";
import { BILIBILI_REQUEST_TYPES } from "@cvsa/contracts";

export type NetworkRequestOutcome =
	| "success"
	| "business_error"
	| "http_error"
	| "rate_limited"
	| "timeout"
	| "connection_error"
	| "other_error";

export interface NetworkRequestMetricSink {
	requestStarted(attributes: NetworkMetricAttributes): void;
	requestDurationMs(value: number, attributes: NetworkMetricAttributes): void;
	requestsInFlight(delta: number, attributes: NetworkMetricAttributes): void;
}

export interface NetworkRequestMetricRecorder {
	createAttemptObserver(context: NetworkAttemptContext): NetworkAttemptObserver;
}

const REQUEST_TYPES = new Set(["bilibili-api", "default", ...BILIBILI_REQUEST_TYPES]);

export function createNetworkRequestMetricRecorder(
	sink: NetworkRequestMetricSink,
	clock: () => number = () => performance.now()
): NetworkRequestMetricRecorder {
	return {
		createAttemptObserver(context) {
			const attributes = createRequestAttributes(context);
			let startedAt: number | undefined;
			let completed = false;

			return {
				started() {
					if (startedAt !== undefined) return;
					startedAt = clock();
					sink.requestStarted(attributes);
					sink.requestsInFlight(1, attributes);
				},
				completed(response) {
					if (startedAt === undefined || completed) return;
					completed = true;
					const elapsed = clock() - startedAt;
					const durationMs = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
					try {
						sink.requestDurationMs(durationMs, {
							...attributes,
							outcome: networkRequestOutcome(response),
						});
					} finally {
						sink.requestsInFlight(-1, attributes);
					}
				},
			};
		},
	};
}

export function networkRequestOutcome(response: NetworkTransportResponse): NetworkRequestOutcome {
	if (response.errorCode === undefined) return "success";
	if (response.errorCode === "REQUEST_TIMEOUT") return "timeout";
	if (response.errorCode === "APPLICATION_RATE_LIMIT") return "rate_limited";
	if (response.errorCode.startsWith("APPLICATION_")) return "business_error";
	if (response.errorCode.startsWith("HTTP_")) {
		// Bilibili signals throttling with 412 as well as 429; both are exit
		// problems, not business errors, and both deserve their own bucket.
		if (response.status === 412 || response.status === 429) return "rate_limited";
		return "http_error";
	}
	if (response.errorCode === "NETWORK_FAILURE") return "connection_error";
	if (response.errorCode === "RATE_LIMITED") return "rate_limited";
	return "other_error";
}

const NETWORK_REQUEST_OUTCOMES: ReadonlySet<string> = new Set([
	"success",
	"business_error",
	"http_error",
	"rate_limited",
	"timeout",
	"connection_error",
	"other_error",
]);

/**
 * Read an outcome back out of the metric attributes.
 *
 * Metric attributes are `string | number`, so anything that is not a known
 * outcome degrades to `"other_error"` instead of leaking an invalid label.
 */
export function parseNetworkRequestOutcome(value: unknown): NetworkRequestOutcome {
	if (typeof value !== "string" || !NETWORK_REQUEST_OUTCOMES.has(value)) return "other_error";
	switch (value) {
		case "success":
		case "business_error":
		case "http_error":
		case "rate_limited":
		case "timeout":
		case "connection_error":
		case "other_error":
			return value;
		default:
			return "other_error";
	}
}

function createRequestAttributes(context: NetworkAttemptContext): NetworkMetricAttributes {
	const requestType = context.request.requestType ?? "default";
	return {
		requestType: REQUEST_TYPES.has(requestType) ? requestType : "other",
		endpoint: endpointLabel(context.request.url),
		egress: context.adapterType === "direct" ? "direct" : "proxy",
	};
}

function endpointLabel(url: string): string {
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return "other";
	}

	switch (pathname) {
		case "/x/web-interface/wbi/search/type":
			return "video_search";
		case "/x/polymer/web-dynamic/v1/feed/topic":
			return "topic_feed";
		case "/x/web-interface/wbi/view/detail":
			return "video_details";
		case "/x/web-interface/archive/related":
			return "related_videos";
		case "/x/web-interface/view":
			return "video_view";
		case "/medialist/gateway/base/resource/infos":
			return "video_stats";
		default:
			return "other";
	}
}
