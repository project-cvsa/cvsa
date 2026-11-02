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

class NetworkAttemptMetricObserver implements NetworkAttemptObserver {
	private startedAt?: number;
	private isCompleted = false;
	private readonly attributes: NetworkMetricAttributes;

	constructor(
		context: NetworkAttemptContext,
		private readonly sink: NetworkRequestMetricSink,
		private readonly clock: () => number
	) {
		this.attributes = createRequestAttributes(context);
	}

	started = (): void => {
		if (this.startedAt !== undefined) return;
		this.startedAt = this.clock();
		this.sink.requestStarted(this.attributes);
		this.sink.requestsInFlight(1, this.attributes);
	};

	completed = (response: NetworkTransportResponse): void => {
		if (this.startedAt === undefined || this.isCompleted) return;
		this.isCompleted = true;

		const elapsed = this.clock() - this.startedAt;
		const durationMs = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
		try {
			this.sink.requestDurationMs(durationMs, {
				...this.attributes,
				outcome: networkRequestOutcome(response),
			});
		} finally {
			this.sink.requestsInFlight(-1, this.attributes);
		}
	};
}

export function createNetworkRequestMetricRecorder(
	sink: NetworkRequestMetricSink,
	clock: () => number = () => performance.now()
): NetworkRequestMetricRecorder {
	return {
		createAttemptObserver: (context) => new NetworkAttemptMetricObserver(context, sink, clock),
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

export function requestTypeLabel(value: string | number | undefined): string {
	if (typeof value === "string" && REQUEST_TYPES.has(value)) {
		return value;
	}
	if (value === undefined) {
		return "default";
	}
	return "other";
}

function createRequestAttributes(context: NetworkAttemptContext): NetworkMetricAttributes {
	return {
		requestType: requestTypeLabel(context.request.requestType),
		endpoint: endpointLabel(context.request.url),
		egress: context.adapterId,
		retry: context.retry ? 1 : 0,
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
