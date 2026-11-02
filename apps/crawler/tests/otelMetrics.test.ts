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
import { STATS_COUNTERS, STATS_ERROR_KINDS } from "../src/crawler/stats/types";

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
	test("exports every business counter, error, task result, retry, latency and queue gauge from the same events as minute statistics", async () => {
		const collector = new CrawlerStatsCollector({
			metrics: createStatsMetrics(),
			rollup: new InMemoryStatsStore(),
			overview: {
				async queueCounts() {
					return {
						tracking: { waiting: 3, active: 2, delayed: 1, failed: 0, completed: 4 },
						discovery: { waiting: 5, active: 1, delayed: 0, failed: 1, completed: 2 },
					};
				},
				async countOverdue() {
					return { overdueCount: 6, maxOverdueLagSec: 42 };
				},
			},
		});
		const { provider, exporter } = setupMetrics();
		try {
			for (const counter of STATS_COUNTERS) collector.recordCount(counter, 2);
			for (const kind of STATS_ERROR_KINDS) collector.recordError(kind);
			collector.recordJobOutcome("tracking", "completed");
			collector.recordJobOutcome("discovery", "failed");
			collector.recordJobOutcome("discovery", "deferred");
			collector.recordInference(125, false);
			collector.recordTask(800);
			collector.recordNetworkRequest(20);
			collector.recordRetry(2);
			await collector.flush();
			const report = await collector.getReport("5m");
			await provider.forceFlush();
			const events = numberPoints(exporter, STATS_METRIC_NAMES.events);
			for (const counter of STATS_COUNTERS)
				expect(events.find((point) => point.attributes.kind === counter)?.value).toBe(
					report.metrics.counters[counter]
				);
			const errors = numberPoints(exporter, STATS_METRIC_NAMES.errors);
			for (const kind of STATS_ERROR_KINDS)
				expect(errors.find((point) => point.attributes.kind === kind)?.value).toBe(
					report.metrics.errors[kind]
				);
			expect(metricData(exporter, STATS_METRIC_NAMES.retries)[0]?.dataPoints[0]?.value).toBe(
				2
			);
			const jobs = numberPoints(exporter, STATS_METRIC_NAMES.jobResults);
			expect(
				jobs.map((point) => [point.attributes.queue, point.attributes.outcome, point.value])
			).toEqual([
				["tracking", "completed", 1],
				["discovery", "failed", 1],
				["discovery", "deferred", 1],
			]);
			const durations = histogramPoints(exporter, STATS_METRIC_NAMES.durationMs);
			expect(durations.map((point) => [point.attributes.kind, point.value])).toEqual([
				["inference", expect.objectContaining({ count: 1, sum: 125 })],
				["task", expect.objectContaining({ count: 1, sum: 800 })],
				["api", expect.objectContaining({ count: 1, sum: 20 })],
			]);
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
		const collector = new CrawlerStatsCollector({ metrics: createStatsMetrics() });
		const network = createNetworkMetrics({
			onRequestFinishedWithAttributes(ms, outcome, attributes) {
				collector.recordNetworkRequest(ms, outcome, attributes);
				if (attributes.retry === 1) collector.recordRetry();
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
			expect((await collector.getReport("5m")).metrics.counters.networkRequests).toBe(1);
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
