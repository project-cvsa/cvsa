import { appLogger } from "@cvsa/logger";
import { z } from "zod";
import {
	CRAWLER_LATENCY_BOUNDS_MS,
	CRAWLER_RATE_METRICS,
	CRAWLER_STATS_FORMAT_VERSION,
	CRAWLER_STATS_PERSIST_INTERVAL_MS,
	CRAWLER_STATS_RESOURCE_INTERVAL_MS,
	CRAWLER_STATS_STALL_MS,
	CRAWLER_STATS_STATE_INTERVAL_MS,
	CrawlerStatsQueueStateSchema,
	CrawlerStatsTrackingStateSchema,
	type CrawlerStatsCoverage,
	type CrawlerStatsPersistence,
	type CrawlerStatsWindow,
	type CrawlerStatsMinuteV2,
} from "@cvsa/contracts";
import { toInstant } from "@cvsa/snapshot-db";
import type {
	SaveStatsMinuteInput,
	StatsHourPendingRow,
	StatsHourRow,
	StatsInstanceRow,
	StatsLegacyMinuteRow,
	StatsMinuteRow,
	StatsStateRow,
} from "./rollup";
import {
	computeRatios,
	derivedChartMetrics,
	distributionKey,
	mergeMinutes,
	pickGranularity,
	summarizeLatency,
	windowMinutes,
} from "./aggregation";
import { createSketch, mergeDistributionInto, serializeSketch, summarizeSketch } from "./sketch";
import {
	emptyDiscoveryCounts,
	emptyMinute,
	emptyNetworkTotals,
	emptyOutcomeCounts,
	type StatsDeferral,
	type StatsDiscoveryResult,
	type StatsMinute,
	type StatsNetworkAttributes,
	type StatsNetworkOutcome,
	type StatsOutcome,
	type StatsOverviewDeps,
	type StatsQueueName,
	type StatsRecorder,
	type StatsMetricSink,
	type StatsInstanceState,
} from "./types";
import type { StatsHeartbeatStore } from "./heartbeat";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const STATE_SLOT_MS = 30_000;
const GLOBAL_STATE_ITEMS = ["queues", "tracking", "model", "export", "strategies"];
const RETENTION_MS = 10_080 * MINUTE_MS;

export interface StatsStore {
	saveMinute(input: SaveStatsMinuteInput): Promise<void>;
	listMinutes(
		from: ReturnType<typeof toInstant>,
		to: ReturnType<typeof toInstant>
	): Promise<StatsMinuteRow[]>;
	listLegacyMinutes(
		from: ReturnType<typeof toInstant>,
		to: ReturnType<typeof toInstant>
	): Promise<StatsLegacyMinuteRow[]>;
	upsertInstance(row: StatsInstanceRow): Promise<void>;
	listInstances(
		from: ReturnType<typeof toInstant>,
		to: ReturnType<typeof toInstant>
	): Promise<StatsInstanceRow[]>;
	listRecentInstances(limit?: number): Promise<StatsInstanceRow[]>;
	listPendingHours(limit?: number): Promise<StatsHourPendingRow[]>;
	listMinutesForHour(
		hour: ReturnType<typeof toInstant>,
		sourceId: string
	): Promise<StatsMinuteRow[]>;
	saveHour(
		hour: ReturnType<typeof toInstant>,
		sourceId: string,
		generation: number,
		metrics: CrawlerStatsMinuteV2
	): Promise<void>;
	listHours(
		from: ReturnType<typeof toInstant>,
		to: ReturnType<typeof toInstant>
	): Promise<StatsHourRow[]>;
	saveStates(
		rows: Array<{
			sampledAt: ReturnType<typeof toInstant>;
			scope: string;
			item: string;
			status: string;
			data: unknown;
		}>
	): Promise<void>;
	listStates(
		from: ReturnType<typeof toInstant>,
		to: ReturnType<typeof toInstant>
	): Promise<StatsStateRow[]>;
	listAvailability(): Promise<Array<{ metric: string; enabledAt: ReturnType<typeof toInstant> }>>;
	readRange(
		from: ReturnType<typeof toInstant>,
		to: ReturnType<typeof toInstant>,
		includeHours: boolean
	): Promise<import("./rollup").StatsRangeData>;
	markMetricsEnabled(
		metrics: readonly string[],
		enabledAt: ReturnType<typeof toInstant>
	): Promise<void>;
	withHourlyRollupLock<T>(work: () => Promise<T>): Promise<T | null>;
	withStateSamplingLock<T>(work: () => Promise<T>): Promise<T | null>;
	latestStateSampleAt(): Promise<number | null>;
}

export interface CrawlerStatsCollectorOptions {
	now?: () => number;
	overview?: StatsOverviewDeps;
	store?: StatsStore;
	metrics?: StatsMetricSink;
	heartbeat?: StatsHeartbeatStore;
	instanceId?: string;
	persistIntervalMs?: number;
	stateIntervalMs?: number;
	resourceIntervalMs?: number;
}

interface PersistenceCounters {
	successes: number;
	failures: number;
	lastSuccessAt: number | null;
	lastPersistedAt: number | null;
	lastError: string | null;
}

export interface StatsSeriesPoint {
	bucketTime: string;
	metricGroup: string;
	metrics: Record<string, number | null>;
	coverage: "complete" | "partial" | "none";
}

export interface StatsReport {
	window: CrawlerStatsWindow;
	from: number;
	to: number;
	minutes: StatsMinute;
	range: { from: number; to: number; seconds: number };
	latency: ReturnType<typeof summarizeLatency>;
	series: StatsSeriesPoint[];
	coverage: CrawlerStatsCoverage;
	instances: StatsInstanceState[];
	persistence: CrawlerStatsPersistence;
	states: StatsStateRow[];
	latestStates: Map<string, StatsStateRow>;
	availability: Array<{ metric: string; enabledAt: ReturnType<typeof toInstant> }>;
	legacy: {
		from: number;
		to: number;
		counters: import("@cvsa/contracts").CrawlerStatsCounters;
		errors: import("@cvsa/contracts").CrawlerStatsErrors;
		latencyP95Ms: Record<string, number>;
	} | null;
}

export class CrawlerStatsCollector implements StatsRecorder {
	readonly instanceId: string;
	private readonly startedAt: number;
	private readonly now: () => number;
	private readonly overviewDeps: StatsOverviewDeps;
	private readonly store: StatsStore | undefined;
	private readonly metrics: StatsMetricSink | undefined;
	private readonly heartbeatStore: StatsHeartbeatStore | undefined;
	private readonly buckets = new Map<number, StatsMinute>();
	private readonly generations = new Map<number, number>();
	private readonly dirty = new Set<number>();
	private readonly writeLatency = createSketch();
	private readonly counters: PersistenceCounters = {
		successes: 0,
		failures: 0,
		lastSuccessAt: null,
		lastPersistedAt: null,
		lastError: null,
	};
	private heartbeatAt: number;
	private lastHeartbeatAt: number;
	private lastStateSlot = 0;
	private lastResourceAt = 0;
	private lastRollupAt = 0;
	private rollupFailures = 0;
	private flushTimer: ReturnType<typeof setInterval> | undefined;
	private stateTimer: ReturnType<typeof setInterval> | undefined;
	private rollupTimer: ReturnType<typeof setInterval> | undefined;
	private flushing: Promise<number> | undefined;
	private availabilityMarked = false;
	private coveredTo: number;
	private readonly persistIntervalMs: number;
	private readonly stateIntervalMs: number;
	private readonly resourceIntervalMs: number;
	private inFlightHttp = 0;

	constructor(options: CrawlerStatsCollectorOptions = {}) {
		this.now = options.now ?? Date.now;
		this.startedAt = this.now();
		this.heartbeatAt = Math.floor(this.startedAt / MINUTE_MS) * MINUTE_MS;
		this.lastHeartbeatAt = this.startedAt;
		this.coveredTo = this.heartbeatAt;
		this.instanceId = options.instanceId ?? crypto.randomUUID();
		this.overviewDeps = options.overview ?? {};
		this.store = options.store;
		this.metrics = options.metrics;
		this.heartbeatStore = options.heartbeat;
		this.persistIntervalMs = options.persistIntervalMs ?? CRAWLER_STATS_PERSIST_INTERVAL_MS;
		this.stateIntervalMs = options.stateIntervalMs ?? CRAWLER_STATS_STATE_INTERVAL_MS;
		this.resourceIntervalMs = options.resourceIntervalMs ?? CRAWLER_STATS_RESOURCE_INTERVAL_MS;
	}

	record(counter: keyof StatsMinute["counters"], count = 1): void {
		this.bucket().counters[counter] += count;
		this.metrics?.recordCounter(counter, count);
	}

	recordJobStarted(queue: StatsQueueName): void {
		this.record(queue === "tracking" ? "trackingJobsStarted" : "discoveryJobsStarted");
	}

	recordJobOutcome(queue: StatsQueueName, outcome: StatsOutcome, latencyMs = 0): void {
		const bucket = this.bucket();
		const jobs = bucket.jobs[queue];
		const results: Record<StatsOutcome, keyof typeof jobs> = {
			success: "completed",
			failure: "failed",
			deferred: "deferred",
			cancelled: "cancelled",
			timeout: "timeout",
		};
		jobs[results[outcome]]++;
		this.record(queue === "tracking" ? "trackingJobsFinished" : "discoveryJobsFinished");
		this.observe(
			queue === "tracking" ? "trackingExecution" : "discoveryExecution",
			outcome,
			latencyMs
		);
		this.metrics?.recordJobOutcome(queue, outcome);
	}

	recordQueueWait(latencyMs: number): void {
		this.observe("queueWait", "success", latencyMs);
	}

	recordHttpAttemptStarted(_attributes: StatsNetworkAttributes = {}): void {
		this.inFlightHttp++;
		this.record("httpAttemptsStarted");
	}

	recordHttpAttempt(
		latencyMs: number,
		outcome: StatsNetworkOutcome,
		attributes: StatsNetworkAttributes = {}
	): void {
		this.inFlightHttp = Math.max(0, this.inFlightHttp - 1);
		this.record("httpAttemptsFinished");
		const transportSuccess = outcome === "success" || outcome === "business_error";
		if (transportSuccess) this.record("httpAttemptsTransportSuccess");
		if (outcome === "cancelled") this.record("httpAttemptsCancelled");
		if (attributes.retry === 1) this.record("egressSwitchResends");
		const mapped: StatsOutcome =
			outcome === "timeout"
				? "timeout"
				: outcome === "cancelled"
					? "cancelled"
					: transportSuccess
						? "success"
						: "failure";
		const key = `${attributes.requestType ?? "default"}|${attributes.endpoint ?? "other"}|${attributes.egress ?? "unknown"}`;
		const totals = this.bucket().network[key] ?? emptyNetworkTotals();
		totals.attempts++;
		if (transportSuccess) totals.transportSuccess++;
		else if (outcome === "timeout") totals.timeout++;
		else if (outcome === "cancelled") totals.cancelled++;
		else totals.transportFailure++;
		if (outcome === "success") totals.businessSuccess++;
		if (outcome === "business_error") totals.businessError++;
		if (outcome === "rate_limited") totals.rateLimited++;
		if (attributes.retry === 1) totals.egressResends++;
		this.bucket().network[key] = totals;
		this.observe("httpAttempt", mapped, latencyMs);
	}

	recordLogicalRequest(latencyMs: number, outcome: StatsOutcome, attempts: number): void {
		this.record("logicalRequestsFinished");
		if (outcome === "success") this.record("logicalRequestSuccess");
		else if (outcome === "failure") this.record("logicalRequestFailure");
		else if (outcome === "timeout") this.record("logicalRequestTimeout");
		else if (outcome === "cancelled") this.record("logicalRequestCancelled");
		if (attempts > 1) {
			this.record("retriedLogicalRequests");
			if (outcome === "success") this.record("retriedLogicalRequestSuccess");
		}
		this.observe("logicalRequest", outcome, latencyMs);
	}

	recordSessionRecovery(latencyMs: number, outcome: StatsOutcome): void {
		this.record("sessionRecoveryResends");
		this.observe("sessionRecovery", outcome, latencyMs);
	}

	recordDiscovery(channel: string, result: StatsDiscoveryResult): void {
		const bucket = this.bucket();
		const counts = bucket.discovery[channel] ?? emptyDiscoveryCounts();
		counts[result]++;
		bucket.discovery[channel] = counts;
		const counterMap: Record<StatsDiscoveryResult, keyof StatsMinute["counters"]> = {
			appeared: "discoveryCandidatesAppeared",
			newTracking: "discoveryNewTracking",
			existing: "discoveryExisting",
			rejected: "discoveryRejected",
			skipped: "discoverySkipped",
			deferred: "discoveryDeferred",
			cancelled: "discoveryCancelled",
			timeout: "discoveryTimeout",
			failure: "discoveryFailed",
		};
		this.record(counterMap[result]);
		const mapped: StatsOutcome =
			result === "failure"
				? "failure"
				: result === "deferred"
					? "deferred"
					: result === "cancelled"
						? "cancelled"
						: result === "timeout"
							? "timeout"
							: "success";
		this.metrics?.recordDiscovery(channel, result);
		if (mapped !== "success") this.metrics?.recordLatency("discoveryExecution", mapped, 0);
	}

	recordDiscoveryDecision(reason: string, accepted: boolean): void {
		const bucket = this.bucket();
		const counts = bucket.discoveryReasons[reason] ?? { accepted: 0, rejected: 0 };
		if (accepted) counts.accepted++;
		else counts.rejected++;
		bucket.discoveryReasons[reason] = counts;
	}

	recordDeferral(deferral: StatsDeferral): void {
		const counters: Record<StatsDeferral["reason"], keyof StatsMinute["counters"]> = {
			local_budget: "deferralLocalBudget",
			upstream_throttle: "deferralUpstreamThrottle",
			egress_unavailable: "deferralEgressUnavailable",
			task_retry: "deferralTaskRetry",
			queue_capacity: "deferralQueueCapacity",
			model_unavailable: "deferralModelUnavailable",
		};
		this.record(counters[deferral.reason]);
		if (deferral.requestedMs !== undefined)
			this.record("deferralRequestedMs", deferral.requestedMs);
		const bucket = this.bucket();
		bucket.deferrals[deferral.reason] = (bucket.deferrals[deferral.reason] ?? 0) + 1;
		this.metrics?.recordDeferral(deferral.reason);
	}

	recordDatabase(
		module: string,
		operation: string,
		latencyMs: number,
		outcome: StatsOutcome = "success"
	): void {
		const key = `${module}.${operation}`;
		const bucket = this.bucket();
		const counts = bucket.database[key] ?? emptyOutcomeCounts();
		counts[outcome]++;
		bucket.database[key] = counts;
		this.observe("databaseOperation", outcome, latencyMs);
		this.recordSample(`databaseOperation:${key}:${outcome}`, latencyMs);
		this.metrics?.recordDatabase(module, operation, outcome);
	}

	recordRedis(
		area: string,
		command: string,
		latencyMs: number,
		outcome: StatsOutcome = "success"
	): void {
		const key = `${area}.${command}`;
		const bucket = this.bucket();
		const counts = bucket.redis[key] ?? emptyOutcomeCounts();
		counts[outcome]++;
		bucket.redis[key] = counts;
		this.observe("redisOperation", outcome, latencyMs);
		this.recordSample(`redisOperation:${key}:${outcome}`, latencyMs);
		this.metrics?.recordRedis(area, command, outcome);
	}

	recordMetadataRefresh(
		outcome: StatsOutcome,
		latencyMs: number,
		rows: { inserted: number; changed: number; unchanged: number }
	): void {
		const counters: Record<StatsOutcome, keyof StatsMinute["counters"]> = {
			success: "metadataRefreshSuccess",
			failure: "metadataRefreshFailure",
			deferred: "metadataRefreshFailure",
			cancelled: "metadataRefreshCancelled",
			timeout: "metadataRefreshTimeout",
		};
		this.record(counters[outcome]);
		this.record("metadataRowsInserted", rows.inserted);
		this.record("metadataRowsChanged", rows.changed);
		this.record("metadataRowsUnchanged", rows.unchanged);
		this.observe("metadataRefresh", outcome, latencyMs);
	}

	recordCredentialsRefresh(outcome: StatsOutcome, latencyMs: number): void {
		this.record(
			outcome === "success" ? "credentialsRefreshSuccess" : "credentialsRefreshFailure"
		);
		this.observe("credentialsRefresh", outcome, latencyMs);
	}

	recordModelInference(latencyMs: number, succeeded: boolean): void {
		this.record("modelInferenceCalls");
		this.observe("modelProcess", succeeded ? "success" : "failure", latencyMs);
	}

	recordModelWait(latencyMs: number, outcome: StatsOutcome): void {
		this.record("modelWaits");
		this.observe("modelWait", outcome, latencyMs);
	}

	recordModelLifecycle(
		kind: "loadFailure" | "start" | "exit" | "timeoutTermination" | "cancelTermination"
	): void {
		const counters = {
			loadFailure: "modelLoadFailures",
			start: "modelStarts",
			exit: "modelExits",
			timeoutTermination: "modelTimeoutTerminations",
			cancelTermination: "modelCancelTerminations",
		} as const;
		this.record(counters[kind]);
	}

	recordModelHealth(_latencyMs: number, reachable: boolean): void {
		this.record("modelHealthCalls");
		this.observe("modelProcess", reachable ? "success" : "failure", _latencyMs);
	}

	private observe(
		operation: Parameters<typeof distributionKey>[0],
		outcome: StatsOutcome,
		ms: number
	): void {
		this.recordSample(distributionKey(operation, outcome), ms);
		this.metrics?.recordLatency(operation, outcome, ms);
	}

	private recordSample(key: string, ms: number): void {
		const bucket = this.bucket();
		const sketch = bucket.distributions[key]
			? mergeSketch(bucket.distributions[key])
			: createSketch();
		sketch.accept(Math.max(0, ms));
		bucket.distributions[key] = serializeSketch(sketch);
	}

	private bucket(at = this.now()): StatsMinute {
		const start = Math.floor(at / MINUTE_MS) * MINUTE_MS;
		let bucket = this.buckets.get(start);
		if (!bucket) {
			bucket = emptyMinute(start, Math.max(start, at));
			this.buckets.set(start, bucket);
		}
		bucket.to = Math.max(bucket.to, at);
		this.markDirty(start);
		return bucket;
	}

	private markDirty(start: number): void {
		this.dirty.add(start);
		this.generations.set(start, (this.generations.get(start) ?? 0) + 1);
	}

	private heartbeat(at: number): void {
		const currentMinute = Math.floor(at / MINUTE_MS) * MINUTE_MS;
		for (let start = this.heartbeatAt; start < currentMinute; start += MINUTE_MS) {
			if (!this.buckets.has(start)) {
				const bucket = emptyMinute(start, start + MINUTE_MS);
				this.buckets.set(start, bucket);
				this.markDirty(start);
			}
		}
		this.heartbeatAt = Math.max(this.heartbeatAt, currentMinute);
		const earliest = currentMinute - RETENTION_MS;
		for (const start of this.buckets.keys())
			if (start < earliest) {
				this.buckets.delete(start);
				this.dirty.delete(start);
				this.generations.delete(start);
			}
	}

	flush(at = this.now()): Promise<number> {
		const persist = () => this.persist(at);
		const pending = this.flushing ? this.flushing.then(persist, persist) : persist();
		const result = pending.finally(() => {
			if (this.flushing === result) this.flushing = undefined;
		});
		this.flushing = result;
		return result;
	}

	private async persist(at: number): Promise<number> {
		this.heartbeat(at);
		await this.writeHeartbeat(at);
		if (!this.store) {
			this.dirty.clear();
			return 0;
		}
		if (!this.availabilityMarked) {
			this.availabilityMarked = true;
			await this.store
				.markMetricsEnabled(
					["v2", ...Object.keys(this.buckets.values().next().value?.distributions ?? {})],
					toInstant(new Date(this.startedAt))
				)
				.catch((error) => appLogger.warn("Metric availability write failed", { error }));
		}
		const captured = [...this.dirty].map((time) => ({
			time,
			generation: this.generations.get(time) ?? 0,
			metrics: structuredClone(this.buckets.get(time) ?? emptyMinute(time, time + MINUTE_MS)),
		}));
		let written = 0;
		let firstError: unknown;
		for (const entry of captured) {
			const startedAt = performance.now();
			const currentMinuteStart = Math.floor(at / MINUTE_MS) * MINUTE_MS;
			const coveredTo = Math.max(
				this.coveredTo,
				Math.min(entry.time + MINUTE_MS, currentMinuteStart)
			);
			try {
				await this.store.saveMinute({
					sourceId: this.instanceId,
					bucketTime: toInstant(new Date(entry.time)),
					metrics: entry.metrics,
					instance: {
						instanceId: this.instanceId,
						startedAt: toInstant(new Date(this.startedAt)),
						exitedAt: null,
						lastPersistedAt: toInstant(new Date(at)),
						coveredTo: toInstant(new Date(coveredTo)),
						formatVersion: CRAWLER_STATS_FORMAT_VERSION,
					},
				});
				this.writeLatency.accept(performance.now() - startedAt);
				this.counters.successes++;
				this.counters.lastSuccessAt = at;
				this.counters.lastError = null;
				written++;
				this.coveredTo = coveredTo;
				if ((this.generations.get(entry.time) ?? 0) === entry.generation)
					this.dirty.delete(entry.time);
			} catch (error) {
				this.counters.failures++;
				this.counters.lastError = error instanceof Error ? error.message : String(error);
				firstError ??= error;
			}
		}
		if (written > 0) this.counters.lastPersistedAt = at;
		if (this.store && written === 0 && this.counters.successes === 0) {
			await this.store
				.upsertInstance({
					instanceId: this.instanceId,
					startedAt: toInstant(new Date(this.startedAt)),
					exitedAt: null,
					lastPersistedAt: toInstant(new Date(at)),
					coveredTo: toInstant(new Date(this.coveredTo)),
					formatVersion: CRAWLER_STATS_FORMAT_VERSION,
				})
				.catch((error) => {
					firstError ??= error;
				});
		}
		if (firstError) throw firstError;
		return written;
	}

	private async writeHeartbeat(at: number): Promise<void> {
		if (!this.heartbeatStore) return;
		try {
			await this.heartbeatStore.write(this.instanceId, at);
			this.lastHeartbeatAt = at;
		} catch (error) {
			appLogger.warn("Crawler stats heartbeat write failed", { error });
		}
	}

	async sampleState(at = this.now()): Promise<void> {
		const store = this.store;
		if (!store) return;
		const slot = Math.floor(at / STATE_SLOT_MS) * STATE_SLOT_MS;
		if (slot === this.lastStateSlot) return;
		const saved = await store.withStateSamplingLock(async () => {
			const sampledAt = toInstant(new Date(slot));
			const rows: Parameters<StatsStore["saveStates"]>[0] = [];
			const latest = await store.latestStateSampleAt();
			if (latest !== null) {
				const earliest = Math.max(latest + STATE_SLOT_MS, slot - 5 * 60_000);
				for (
					let missing = Math.ceil(earliest / STATE_SLOT_MS) * STATE_SLOT_MS;
					missing < slot;
					missing += STATE_SLOT_MS
				) {
					for (const item of GLOBAL_STATE_ITEMS)
						rows.push({
							sampledAt: toInstant(new Date(missing)),
							scope: "global",
							item,
							status: "missing",
							data: {},
						});
					rows.push({
						sampledAt: toInstant(new Date(missing)),
						scope: this.instanceId,
						item: "resources",
						status: "missing",
						data: {},
					});
				}
			}
			const collect = async <T>(item: string, load: () => Promise<T>, scope = "global") => {
				try {
					const data = await load();
					rows.push({ sampledAt, scope, item, status: "success", data });
				} catch (error) {
					rows.push({
						sampledAt,
						scope,
						item,
						status: "failure",
						data: { error: error instanceof Error ? error.message : String(error) },
					});
				}
			};
			if (this.overviewDeps.queueCounts) {
				try {
					const queues = await this.overviewDeps.queueCounts();
					rows.push({
						sampledAt,
						scope: "global",
						item: "queues",
						status: "success",
						data: queues,
					});
					for (const [queue, counts] of Object.entries(queues)) {
						if (queue === "tracking" || queue === "discovery")
							this.metrics?.recordQueue(queue, counts);
					}
				} catch (error) {
					rows.push({
						sampledAt,
						scope: "global",
						item: "queues",
						status: "failure",
						data: { error: error instanceof Error ? error.message : String(error) },
					});
				}
			}
			if (this.overviewDeps.trackingState) {
				try {
					const tracking = await this.overviewDeps.trackingState(at);
					rows.push({
						sampledAt,
						scope: "global",
						item: "tracking",
						status: "success",
						data: tracking,
					});
					this.metrics?.recordTracking({
						overdueCount: tracking.dueNow,
						maxOverdueLagSec: tracking.maxOverdueLagSec,
					});
				} catch (error) {
					rows.push({
						sampledAt,
						scope: "global",
						item: "tracking",
						status: "failure",
						data: { error: error instanceof Error ? error.message : String(error) },
					});
				}
			}
			if (this.overviewDeps.modelState)
				await collect(
					"model",
					() => this.overviewDeps.modelState?.() ?? Promise.resolve(null)
				);
			if (this.overviewDeps.exportState)
				await collect(
					"export",
					() => this.overviewDeps.exportState?.() ?? Promise.resolve(null)
				);
			if (this.overviewDeps.strategies)
				await collect(
					"strategies",
					() => this.overviewDeps.strategies?.() ?? Promise.resolve([])
				);
			if (
				this.overviewDeps.resourceState &&
				at - this.lastResourceAt >= this.resourceIntervalMs
			) {
				this.lastResourceAt = at;
				await collect(
					"resources",
					() => this.overviewDeps.resourceState?.() ?? Promise.resolve(null),
					this.instanceId
				);
			}
			await store.saveStates(rows);
			return true;
		});
		if (saved) this.lastStateSlot = slot;
	}

	async runHourlyRollup(at = this.now()): Promise<number> {
		if (!this.store) return 0;
		if (at - this.lastRollupAt < 60_000) return 0;
		this.lastRollupAt = at;
		try {
			const rolled = await this.store.withHourlyRollupLock(async () => {
				let count = 0;
				for (const pending of (await this.store?.listPendingHours(24)) ?? []) {
					const minutes = await this.store?.listMinutesForHour(
						pending.hourTime,
						pending.sourceId
					);
					if (!minutes || minutes.length === 0) continue;
					const metrics = mergeMinutes(
						minutes.map((row) => row.metrics),
						pending.hourTime.epochMilliseconds,
						pending.hourTime.epochMilliseconds + HOUR_MS
					);
					await this.store?.saveHour(
						pending.hourTime,
						pending.sourceId,
						pending.generation,
						metrics
					);
					count++;
				}
				return count;
			});
			return rolled ?? 0;
		} catch (error) {
			this.rollupFailures++;
			throw error;
		}
	}

	async getReport(
		window: CrawlerStatsWindow,
		minutes?: number,
		quantiles?: readonly number[]
	): Promise<StatsReport> {
		const at = this.now();
		const to = Math.floor(at / MINUTE_MS) * MINUTE_MS;
		const count = minutes ?? windowMinutes(window);
		const from = to - count * MINUTE_MS;
		const fromInstant = toInstant(new Date(from));
		const toInstantBound = toInstant(new Date(to));
		const rangeData = this.store
			? await this.store.readRange(fromInstant, toInstantBound, true)
			: {
					minutes: [...this.buckets.entries()]
						.filter(([time]) => time >= from && time < to)
						.map(([time, metrics]) => ({
							sourceId: this.instanceId,
							bucketTime: toInstant(new Date(time)),
							metrics,
						})),
					legacy: [],
					instances: [],
					states: [],
					hours: [],
					pendingHours: [],
					availability: [],
				};
		const v2Rows = rangeData.minutes;
		const merged = mergeMinutes(
			v2Rows.map((row) => row.metrics),
			from,
			to
		);
		const legacyRows = rangeData.legacy;
		const instances = rangeData.instances;
		const persistedInstances = instances.filter(
			(instance) => instance.formatVersion === CRAWLER_STATS_FORMAT_VERSION
		);
		const instanceStates: StatsInstanceState[] = [];
		for (const instance of persistedInstances) {
			instanceStates.push({
				instanceId: instance.instanceId,
				startedAt: instance.startedAt.epochMilliseconds,
				exitedAt: instance.exitedAt?.epochMilliseconds ?? null,
				lastPersistedAt: instance.lastPersistedAt.epochMilliseconds,
				coveredTo: instance.coveredTo.epochMilliseconds,
				heartbeatAt: await this.readHeartbeat(instance.instanceId),
			});
		}
		const availability = rangeData.availability;
		const enabledAt = availability.length
			? Math.min(...availability.map((row) => row.enabledAt.epochMilliseconds))
			: (persistedInstances[0]?.startedAt.epochMilliseconds ?? null);
		const coverage = this.coverage(from, to, count, v2Rows, instanceStates, enabledAt);
		const states = rangeData.states;
		const latestStates = new Map<string, StatsStateRow>();
		for (const state of states) latestStates.set(state.item, state);
		const series = await this.series(
			from,
			to,
			count,
			v2Rows,
			instanceStates,
			rangeData.hours,
			new Set(rangeData.pendingHours.map((row) => row.hourTime.epochMilliseconds)),
			states
		);
		return {
			window,
			from,
			to,
			minutes: merged,
			range: { from, to, seconds: (to - from) / 1000 },
			latency: summarizeLatency(merged, quantiles),
			series,
			coverage,
			instances: instanceStates,
			persistence: this.persistence(at, rangeData.pendingHours),
			states,
			latestStates,
			availability,
			legacy: this.legacy(legacyRows, from, to, enabledAt),
		};
	}

	private async readHeartbeat(instanceId: string): Promise<number | null> {
		if (!this.heartbeatStore) return null;
		try {
			return await this.heartbeatStore.read(instanceId);
		} catch {
			return null;
		}
	}

	private coverage(
		from: number,
		to: number,
		count: number,
		rows: StatsMinuteRow[],
		instances: StatsInstanceState[],
		enabledAt: number | null
	): CrawlerStatsCoverage {
		const coveredStarts = new Set(
			rows.map((row) => Math.floor(row.bucketTime.epochMilliseconds / MINUTE_MS) * MINUTE_MS)
		);
		const participated = new Set<number>();
		for (const instance of instances) {
			const end =
				instance.exitedAt ??
				(instance.heartbeatAt !== null
					? instance.heartbeatAt + 30_000
					: instance.lastPersistedAt);
			const start = Math.max(from, Math.floor(instance.startedAt / MINUTE_MS) * MINUTE_MS);
			for (let slot = start; slot < Math.min(to, end); slot += MINUTE_MS)
				participated.add(slot);
		}
		let covered = 0;
		let missing = 0;
		for (let slot = from; slot < to; slot += MINUTE_MS) {
			if (!participated.has(slot)) continue;
			if (coveredStarts.has(slot)) covered++;
			else missing++;
		}
		let unconfirmedFrom: number | null = null;
		for (const instance of instances) {
			if (instance.exitedAt !== null) continue;
			const bound = Math.min(to, instance.coveredTo);
			if (bound < to && bound >= from)
				unconfirmedFrom =
					unconfirmedFrom === null ? bound : Math.min(unconfirmedFrom, bound);
		}
		const legacyRange = enabledAt !== null && from < enabledAt;
		const status: CrawlerStatsCoverage["status"] =
			participated.size === 0
				? legacyRange
					? "partial"
					: "none"
				: missing === 0
					? "complete"
					: "partial";
		return {
			status,
			from: new Date(from).toISOString(),
			to: new Date(to).toISOString(),
			minutes: count,
			coveredMinutes: covered,
			missingMinutes: missing,
			unconfirmedFrom,
			legacy: legacyRange,
			enabledAt: enabledAt === null ? null : new Date(enabledAt).toISOString(),
			unavailableMetrics: [],
		};
	}

	private gauges(latest: Map<string, StatsStateRow>): {
		waiting: number | null;
		active: number | null;
		overdue: number | null;
	} {
		const queuesRow = latest.get("queues");
		let waiting: number | null = null;
		let active: number | null = null;
		if (queuesRow?.status === "success") {
			const parsed = z
				.record(z.string(), CrawlerStatsQueueStateSchema)
				.safeParse(queuesRow.data);
			if (parsed.success) {
				waiting = Object.values(parsed.data).reduce((sum, queue) => sum + queue.waiting, 0);
				active = Object.values(parsed.data).reduce((sum, queue) => sum + queue.active, 0);
			}
		}
		const tracking = CrawlerStatsTrackingStateSchema.safeParse(latest.get("tracking")?.data);
		const overdue = tracking.success ? tracking.data.dueNow : null;
		return { waiting, active, overdue };
	}

	private async series(
		from: number,
		to: number,
		count: number,
		rows: StatsMinuteRow[],
		instances: StatsInstanceState[],
		hours: StatsHourRow[],
		pendingHours: Set<number>,
		states: StatsStateRow[]
	): Promise<StatsSeriesPoint[]> {
		const { stepMinutes, fromHours } = pickGranularity(count);
		const step = stepMinutes * MINUTE_MS;
		const earliest = Math.floor(from / step) * step;
		const points: StatsSeriesPoint[] = [];
		const participated = new Set<number>();
		const coveredStarts = new Set(
			rows.map((row) => Math.floor(row.bucketTime.epochMilliseconds / MINUTE_MS) * MINUTE_MS)
		);
		for (const instance of instances) {
			const end =
				instance.exitedAt ??
				(instance.heartbeatAt !== null
					? instance.heartbeatAt + 30_000
					: instance.lastPersistedAt);
			for (let slot = from; slot < Math.min(to, end); slot += MINUTE_MS)
				participated.add(slot);
		}
		for (let start = earliest; start < to; start += step) {
			const a = Math.max(from, start);
			const b = Math.min(to, start + step);
			if (a >= b) continue;
			const minutesForPoint: StatsMinute[] = [];
			if (fromHours) {
				for (let hour = Math.floor(a / HOUR_MS) * HOUR_MS; hour < b; hour += HOUR_MS) {
					const hourEnd = hour + HOUR_MS;
					const subA = Math.max(a, hour);
					const subB = Math.min(b, hourEnd);
					if (subA === hour && subB === hourEnd && !pendingHours.has(hour)) {
						const hourRows = hours.filter(
							(row) => row.hourTime.epochMilliseconds === hour
						);
						if (hourRows.length > 0) {
							for (const row of hourRows) minutesForPoint.push(row.metrics);
							continue;
						}
					}
					const overrides = rows.filter((row) => {
						const time = row.bucketTime.epochMilliseconds;
						return time >= subA && time < subB;
					});
					if (overrides.length > 0)
						minutesForPoint.push(
							mergeMinutes(
								overrides.map((row) => row.metrics),
								subA,
								subB
							)
						);
				}
			} else {
				const pointRows = rows.filter((row) => {
					const time = row.bucketTime.epochMilliseconds;
					return time >= a && time < b;
				});
				if (pointRows.length > 0)
					minutesForPoint.push(
						mergeMinutes(
							pointRows.map((row) => row.metrics),
							a,
							b
						)
					);
			}
			const merged = mergeMinutes(minutesForPoint, a, b);
			let missing = 0;
			let total = 0;
			for (let slot = a; slot < b; slot += MINUTE_MS) {
				if (!participated.has(slot)) continue;
				total++;
				if (!coveredStarts.has(slot)) missing++;
			}
			const coverage = total === 0 ? "none" : missing === 0 ? "complete" : "partial";
			const metrics = derivedChartMetrics(merged);
			const gated =
				coverage === "complete"
					? metrics
					: {
							...metrics,
							...Object.fromEntries(
								CRAWLER_RATE_METRICS.map((metric) => [metric.key, null])
							),
						};
			const pointStates = new Map<string, StatsStateRow>();
			for (const state of states)
				if (state.sampledAt.epochMilliseconds >= a && state.sampledAt.epochMilliseconds < b)
					pointStates.set(state.item, state);
			const gauges = this.gauges(pointStates);
			points.push({
				bucketTime: new Date(start).toISOString(),
				metricGroup: "crawler:minute",
				metrics: {
					...gated,
					"queue.waiting": gauges.waiting,
					"queue.active": gauges.active,
					"tracking.overdue": gauges.overdue,
				},
				coverage,
			});
		}
		return points;
	}

	private legacy(
		rows: StatsLegacyMinuteRow[],
		from: number,
		to: number,
		enabledAt: number | null
	): StatsReport["legacy"] {
		if (rows.length === 0) return null;
		const total = {
			jobsCompleted: 0,
			snapshotsSaved: 0,
			videosDiscovered: 0,
			candidatesScanned: 0,
			inferencesRun: 0,
			networkRequests: 0,
			aidsRequested: 0,
			aidsReturned: 0,
			aidsMissing: 0,
			candidatesSeen: 0,
			candidatesSkipped: 0,
			candidatesRejected: 0,
			candidatesFailed: 0,
		};
		const errors = {
			timeout: 0,
			networkFailure: 0,
			httpFailure: 0,
			networkOther: 0,
			adapterUnavailable: 0,
			rateLimited412Or429: 0,
			bilibiliBusinessError: 0,
			inferenceError: 0,
			dbError: 0,
			other: 0,
		};
		const latency = {
			task: Array.from({ length: CRAWLER_LATENCY_BOUNDS_MS.length + 1 }, () => 0),
			api: Array.from({ length: CRAWLER_LATENCY_BOUNDS_MS.length + 1 }, () => 0),
			inference: Array.from({ length: CRAWLER_LATENCY_BOUNDS_MS.length + 1 }, () => 0),
		};
		const max = { task: 0, api: 0, inference: 0 };
		const counterKeys = [
			"jobsCompleted",
			"snapshotsSaved",
			"videosDiscovered",
			"candidatesScanned",
			"inferencesRun",
			"networkRequests",
			"aidsRequested",
			"aidsReturned",
			"aidsMissing",
			"candidatesSeen",
			"candidatesSkipped",
			"candidatesRejected",
			"candidatesFailed",
		] as const;
		const errorKeys = [
			"timeout",
			"networkFailure",
			"httpFailure",
			"networkOther",
			"adapterUnavailable",
			"rateLimited412Or429",
			"bilibiliBusinessError",
			"inferenceError",
			"dbError",
			"other",
		] as const;
		for (const row of rows) {
			for (const key of counterKeys) total[key] += row.metrics.counters[key];
			for (const key of errorKeys) errors[key] += row.metrics.errors[key];
			for (const kind of ["task", "api", "inference"] as const) {
				for (let i = 0; i < latency[kind].length; i++)
					latency[kind][i] += row.metrics.latency[kind][i] ?? 0;
				max[kind] = Math.max(max[kind], row.metrics.latencyMaxMs[kind]);
			}
		}
		return {
			from: enabledAt === null ? from : Math.min(to, enabledAt),
			to,
			counters: total,
			errors,
			latencyP95Ms: {
				task: legacyP95(latency.task, max.task),
				api: legacyP95(latency.api, max.api),
				inference: legacyP95(latency.inference, max.inference),
			},
		};
	}

	private persistence(
		at: number,
		pendingHours: StatsHourPendingRow[] = []
	): CrawlerStatsPersistence {
		const heartbeatAge = at - this.lastHeartbeatAt;
		const persistAge =
			this.counters.lastPersistedAt === null ? 0 : at - this.counters.lastPersistedAt;
		const state =
			heartbeatAge > CRAWLER_STATS_STALL_MS && this.heartbeatStore
				? "heartbeat_expired"
				: persistAge > CRAWLER_STATS_STALL_MS && this.dirty.size > 0
					? "persistence_stalled"
					: "ok";
		const durations = summarizeSketch(this.writeLatency);
		return {
			state,
			lastSuccessAt:
				this.counters.lastSuccessAt === null
					? null
					: new Date(this.counters.lastSuccessAt).toISOString(),
			lastHeartbeatAt: new Date(this.lastHeartbeatAt).toISOString(),
			lastError: this.counters.lastError,
			pendingMinutes: this.dirty.size,
			oldestPendingAgeSec: this.dirty.size ? (at - Math.min(...this.dirty)) / 1000 : null,
			writeSuccesses: this.counters.successes,
			writeFailures: this.counters.failures,
			writeDurationMs: durations.count > 0 ? durations : null,
			pendingHours: pendingHours.length,
			oldestPendingHourAgeSec: pendingHours.length
				? Math.max(
						0,
						(at -
							Math.min(
								...pendingHours.map((row) => row.hourTime.epochMilliseconds)
							)) /
							1000
					)
				: null,
			rollupFailures: this.rollupFailures,
		};
	}

	startPeriodicFlush(intervalMs = this.persistIntervalMs): void {
		if (this.flushTimer || !this.store) return;
		this.flushTimer = setInterval(() => {
			void this.flush().catch((error) =>
				appLogger.error("Crawler stats persistence failed", { error })
			);
		}, intervalMs);
		this.flushTimer.unref?.();
		this.stateTimer = setInterval(() => {
			void this.sampleState().catch((error) =>
				appLogger.warn("Crawler stats state sampling failed", { error })
			);
		}, this.stateIntervalMs);
		this.stateTimer.unref?.();
		this.rollupTimer = setInterval(() => {
			void this.runHourlyRollup().catch((error) =>
				appLogger.warn("Crawler stats hourly rollup failed", { error })
			);
		}, 60_000);
		this.rollupTimer.unref?.();
	}

	stopPeriodicFlush(): void {
		if (this.flushTimer) clearInterval(this.flushTimer);
		if (this.stateTimer) clearInterval(this.stateTimer);
		if (this.rollupTimer) clearInterval(this.rollupTimer);
		this.flushTimer = undefined;
		this.stateTimer = undefined;
		this.rollupTimer = undefined;
	}

	async close(): Promise<void> {
		this.stopPeriodicFlush();
		await this.sampleState().catch(() => {});
		await this.flush();
		if (this.store) {
			await this.store.upsertInstance({
				instanceId: this.instanceId,
				startedAt: toInstant(new Date(this.startedAt)),
				exitedAt: toInstant(new Date(this.now())),
				lastPersistedAt: toInstant(new Date(this.counters.lastPersistedAt ?? this.now())),
				coveredTo: toInstant(new Date(this.coveredTo)),
				formatVersion: CRAWLER_STATS_FORMAT_VERSION,
			});
		}
		await this.heartbeatStore?.close().catch(() => {});
	}

	inFlightHttpRequests(): number {
		return this.inFlightHttp;
	}

	lifetimeCounter(counter: keyof StatsMinute["counters"]): number {
		let total = 0;
		for (const bucket of this.buckets.values()) total += bucket.counters[counter];
		return total;
	}

	ratios(minute: StatsMinute = this.buckets.values().next().value ?? emptyMinute(0, 0)) {
		return computeRatios(minute);
	}
}

function mergeSketch(distribution: import("@cvsa/contracts").CrawlerDistribution) {
	const sketch = createSketch();
	mergeDistributionInto(sketch, distribution);
	return sketch;
}

function legacyP95(histogram: number[], maximum: number): number {
	const target = Math.ceil(histogram.reduce((sum, n) => sum + n, 0) * 0.95);
	if (target === 0) return 0;
	let count = 0;
	for (let i = 0; i < histogram.length; i++) {
		count += histogram[i] ?? 0;
		if (count >= target) return CRAWLER_LATENCY_BOUNDS_MS[i] ?? maximum;
	}
	return 0;
}
