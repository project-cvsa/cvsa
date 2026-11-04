import {
	NetworkScheduler,
	CrawlerExecutionConfigSchema,
	type NetworkAdapter,
	type NetworkRuntimeConfig,
	type NetworkResponse,
} from "@cvsa/network-scheduler";
import { FakeRateLimiter } from "@cvsa/network-scheduler/testing";
import { afterEach, describe, expect, test } from "bun:test";
import { metrics } from "@opentelemetry/api";
import {
	InMemoryMetricExporter,
	MeterProvider,
	PeriodicExportingMetricReader,
	AggregationTemporality,
	DataPointType,
	type MetricData,
} from "@opentelemetry/sdk-metrics";
import { createCrawlerMetrics } from "../src/crawler/shared/telemetry";
import { createCrawlerRuntime } from "../src/crawler/runtime";
import {
	createFakeMq,
	createFakeSnapshotDb,
	InMemoryStatsStore,
} from "../src/crawler/testing/fakes";
import { CrawlerStatsCollector } from "../src/crawler/stats/collector";
import { createStatsMetrics, STATS_METRIC_NAMES } from "../src/crawler/stats/telemetry";
import { createNetworkMetrics, NETWORK_METRIC_NAMES } from "../src/crawler/network/telemetry";

afterEach(() => {
	metrics.disable();
});

function metricData(exporter: InMemoryMetricExporter, name: string): MetricData[] {
	return exporter
		.getMetrics()
		.flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
		.filter((metric) => metric.descriptor.name === name);
}

function numberPoints(exporter: InMemoryMetricExporter, name: string) {
	return metricData(exporter, name).flatMap((metric) =>
		metric.dataPointType === DataPointType.SUM || metric.dataPointType === DataPointType.GAUGE
			? metric.dataPoints
			: []
	);
}
function histogramPoints(exporter: InMemoryMetricExporter, name: string) {
	return metricData(exporter, name).flatMap((metric) =>
		metric.dataPointType === DataPointType.HISTOGRAM ? metric.dataPoints : []
	);
}

function setupMetrics() {
	const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
	const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
	const provider = new MeterProvider({ readers: [reader] });
	metrics.setGlobalMeterProvider(provider);
	return { provider, exporter };
}

describe.serial("crawler OpenTelemetry observations", () => {
	test("exports counters, job results, latency and gauges from the same events", async () => {
		const collector = new CrawlerStatsCollector({
			metrics: createStatsMetrics(),
			store: new InMemoryStatsStore(),
			overview: {
				async queueCounts() {
					return {
						tracking: {
							waiting: 3,
							prioritized: 1,
							active: 2,
							delayed: 1,
							failed: 0,
							completed: 4,
							oldestWaitSec: 5,
							activeAgeSec: 2,
						},
						discovery: {
							waiting: 5,
							prioritized: 0,
							active: 1,
							delayed: 0,
							failed: 1,
							completed: 2,
							oldestWaitSec: 1,
							activeAgeSec: 1,
						},
					};
				},
				async trackingState() {
					return {
						total: 6,
						byState: { regular: 6 },
						byPriority: { "2": 6 },
						neverCaptured: 1,
						freshness: { count: 5, meanSec: 10, quantilesSec: {}, maxSec: 20 },
						freshnessByState: {},
						freshnessByPriority: {},
						dueNow: 6,
						metadataDue: 2,
						maxOverdueLagSec: 42,
					};
				},
			},
		});
		const { provider, exporter } = setupMetrics();
		try {
			collector.record("videosRecorded", 2);
			collector.recordJobOutcome("tracking", "success", 800);
			collector.recordJobOutcome("discovery", "failure", 50);
			collector.recordJobOutcome("discovery", "deferred", 5);
			collector.recordModelInference(125, false);
			collector.recordHttpAttempt(20, "success");
			await collector.sampleState();
			await provider.forceFlush();
			const events = numberPoints(exporter, STATS_METRIC_NAMES.events);
			expect(events.find((point) => point.attributes.kind === "videosRecorded")?.value).toBe(
				2
			);
			const jobs = numberPoints(exporter, STATS_METRIC_NAMES.jobResults);
			expect(
				jobs.map((point) => [point.attributes.queue, point.attributes.outcome, point.value])
			).toEqual([
				["tracking", "success", 1],
				["discovery", "failure", 1],
				["discovery", "deferred", 1],
			]);
			const durations = histogramPoints(exporter, STATS_METRIC_NAMES.durationMs);
			expect(
				durations.map((point) => [
					point.attributes.operation,
					point.attributes.outcome,
					point.value,
				])
			).toEqual(
				expect.arrayContaining([
					[
						"trackingExecution",
						"success",
						expect.objectContaining({ count: 1, sum: 800 }),
					],
					[
						"discoveryExecution",
						"failure",
						expect.objectContaining({ count: 1, sum: 50 }),
					],
					[
						"discoveryExecution",
						"deferred",
						expect.objectContaining({ count: 1, sum: 5 }),
					],
					["modelProcess", "failure", expect.objectContaining({ count: 1, sum: 125 })],
					["httpAttempt", "success", expect.objectContaining({ count: 1, sum: 20 })],
				])
			);
			expect(
				numberPoints(exporter, STATS_METRIC_NAMES.queueJobs).find(
					(point) =>
						point.attributes.queue === "tracking" &&
						point.attributes.state === "waiting"
				)?.value
			).toBe(3);
			expect(
				metricData(exporter, STATS_METRIC_NAMES.overdueVideos)[0]?.dataPoints[0]?.value
			).toBe(6);
			expect(
				metricData(exporter, STATS_METRIC_NAMES.overdueLagSeconds)[0]?.dataPoints[0]?.value
			).toBe(42);
		} finally {
			await provider.shutdown();
		}
	});

	test("counts completed HTTP attempts with result labels and keeps in-flight requests separate", async () => {
		let now = Date.UTC(2026, 0, 1);
		const collector = new CrawlerStatsCollector({
			metrics: createStatsMetrics(),
			now: () => now,
		});
		const network = createNetworkMetrics({
			onRequestStarted(attributes) {
				collector.recordHttpAttemptStarted(attributes);
			},
			onRequestFinishedWithAttributes(ms, outcome, attributes) {
				collector.recordHttpAttempt(ms, outcome, attributes);
			},
		});
		const { provider, exporter } = setupMetrics();
		try {
			const attempt = network.createAttemptObserver?.({
				request: {
					url: "https://api.bilibili.com/x/web-interface/view?aid=10",
					requestType: "bilibili:details",
				},
				adapterId: "direct-a",
				adapterType: "direct",
				retry: true,
			});
			if (!attempt) throw new Error("Expected HTTP attempt observer");
			attempt.started();
			await provider.forceFlush();
			expect(metricData(exporter, NETWORK_METRIC_NAMES.requests)).toHaveLength(0);
			expect(
				metricData(exporter, NETWORK_METRIC_NAMES.requestsInFlight)[0]?.dataPoints[0]?.value
			).toBe(1);
			exporter.reset();
			attempt.completed({
				status: 200,
				headers: {},
				body: "",
				durationMs: 20,
				errorCode: "APPLICATION_ERROR",
			});
			attempt.completed({ status: 200, headers: {}, body: "", durationMs: 20 });
			await provider.forceFlush();
			const completed = metricData(exporter, NETWORK_METRIC_NAMES.requests)[0]?.dataPoints[0];
			expect(completed?.value).toBe(1);
			expect(completed?.attributes).toEqual({
				requestType: "bilibili:details",
				endpoint: "video_view",
				egress: "direct-a",
				retry: 1,
				outcome: "business_error",
			});
			expect(
				metricData(exporter, NETWORK_METRIC_NAMES.requestsInFlight)[0]?.dataPoints[0]?.value
			).toBe(0);
			now += 60_000;
			expect((await collector.getReport("5m")).minutes.counters.httpAttemptsFinished).toBe(1);
		} finally {
			await provider.shutdown();
		}
	});

	test("exports actual HTTP attempts per schedule, including zero when local admission refuses every egress", async () => {
		const network = createNetworkMetrics();
		const { provider, exporter } = setupMetrics();
		const adapters: NetworkAdapter[] = ["direct-a", "direct-b"].map((id) => ({
			id,
			async execute(_request, observer) {
				observer?.started();
				observer?.started();
				const response: NetworkResponse = {
					adapterId: id,
					status: id === "direct-a" ? 503 : 200,
					headers: {},
					body: "",
					durationMs: 10,
					errorCode: id === "direct-a" ? "NETWORK_FAILURE" : undefined,
				};
				observer?.completed(response);
				return response;
			},
		}));
		const config: NetworkRuntimeConfig = {
			adapters: adapters.map(({ id }) => ({
				id,
				type: "direct",
				enabled: true,
				baseWeight: 1,
				rateLimits: [],
			})),
			bindings: [
				{ requestType: "bilibili:tracking", adapterIds: adapters.map(({ id }) => id) },
			],
			requestTypePolicies: {},
			execution: CrawlerExecutionConfigSchema.parse({}),
		};
		const request = {
			url: "https://api.bilibili.com/medialist/gateway/base/resource/infos",
			requestType: "bilibili:tracking",
		};
		try {
			await new NetworkScheduler(
				config,
				new Map(adapters.map((adapter) => [adapter.id, adapter])),
				new FakeRateLimiter(),
				{ metrics: network, random: () => 0 }
			).execute(request);
			await new NetworkScheduler(
				config,
				new Map(adapters.map((adapter) => [adapter.id, adapter])),
				new FakeRateLimiter(["adapter:direct-a", "adapter:direct-b"]),
				{ metrics: network }
			).execute(request);
			await provider.forceFlush();
			expect(
				histogramPoints(exporter, NETWORK_METRIC_NAMES.scheduleAttempts)[0]
			).toMatchObject({
				attributes: { requestType: "bilibili:tracking" },
				value: { count: 2, sum: 2, min: 0, max: 2 },
			});
			expect(
				numberPoints(exporter, NETWORK_METRIC_NAMES.requests).map((point) => [
					point.attributes.outcome,
					point.attributes.retry,
					point.value,
				])
			).toEqual([
				["connection_error", 0, 1],
				["success", 1, 1],
			]);
		} finally {
			await provider.shutdown();
		}
	});

	test("exports startup, dependency failure and shutdown observations before the provider closes", async () => {
		const lifecycle = createCrawlerMetrics();
		const { provider, exporter } = setupMetrics();
		const runtime = createCrawlerRuntime({
			mq: createFakeMq(),
			snapshotDb: createFakeSnapshotDb(),
			metrics: lifecycle,
			observability: {
				async init() {},
				async shutdown() {
					await provider.forceFlush();
				},
			},
		});
		try {
			await runtime.start();
			await runtime.shutdown();
			await runtime.shutdown();
			expect(
				metricData(exporter, "cvsa.crawler.runtime.starts")[0]?.dataPoints[0]?.value
			).toBe(1);
			expect(
				metricData(exporter, "cvsa.crawler.runtime.shutdowns")[0]?.dataPoints[0]?.value
			).toBe(1);
			exporter.reset();
			const failing = createCrawlerRuntime({
				mq: createFakeMq(),
				snapshotDb: {
					...createFakeSnapshotDb(),
					async connect() {
						throw new Error("database unavailable");
					},
				},
				metrics: lifecycle,
				observability: {
					async init() {},
					async shutdown() {
						await provider.forceFlush();
					},
				},
			});
			await expect(failing.start()).rejects.toThrow("database unavailable");
			expect(
				metricData(exporter, "cvsa.crawler.dependency.connection.failures")[0]
					?.dataPoints[0]?.value
			).toBe(1);
		} finally {
			await provider.shutdown();
		}
	});
});
