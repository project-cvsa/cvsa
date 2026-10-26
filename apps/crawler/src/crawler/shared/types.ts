import type { JobsOptions, WorkerOptions } from "bullmq";

export interface CrawlerJob<T> {
	id: string | undefined;
	data: T;
}

export type CrawlerProcessor<T> = (job: CrawlerJob<T>) => Promise<void>;

/** BullMQ job-state counts, normalized so callers never deal with partial maps. */
export interface CrawlerJobCounts {
	waiting: number;
	active: number;
	delayed: number;
	failed: number;
	completed: number;
}

export interface CrawlerQueue<T> {
	add(name: string, data: T, options?: JobsOptions): Promise<void>;
	getJobCounts(): Promise<CrawlerJobCounts>;
	close(): Promise<void>;
}

export interface CrawlerWorker {
	close(): Promise<void>;
}

export interface CrawlerMq {
	connect(): Promise<void>;
	createQueue<T>(name: string, options?: JobsOptions): CrawlerQueue<T>;
	createWorker<T>(
		name: string,
		processor: CrawlerProcessor<T>,
		options?: Omit<WorkerOptions, "connection">
	): CrawlerWorker;
	close(): Promise<void>;
}

export interface CrawlerObservability {
	init(): Promise<void>;
	shutdown(): Promise<void>;
}

export interface CrawlerMetric {
	add(value: number): void;
}

export interface CrawlerMetrics {
	runtimeStarts: CrawlerMetric;
	runtimeShutdowns: CrawlerMetric;
	dependencyFailures: CrawlerMetric;
}

export interface CrawlerRuntimeDependencies {
	observability: CrawlerObservability;
	mq: CrawlerMq;
	snapshotDb: {
		connect(): Promise<void>;
		disconnect(): Promise<void>;
		healthCheck(): Promise<void>;
	};
	metrics?: CrawlerMetrics;
	networkRuntime?: {
		load(): Promise<boolean>;
		startPolling(): void;
		stopPolling(): void;
		close?(): Promise<void>;
	};
	dispatcher?: {
		start(): void;
		stop(): void;
	};
	worker?: CrawlerWorker;
	discoveryWorker?: CrawlerWorker;
	discoveryScheduler?: {
		startScheduledSweeps(intervalMs?: number): Promise<void>;
	};
	/** Loads persisted runtime configuration (discovery filter) before polling starts. */
	discoveryFilter?: {
		initialize(): Promise<void>;
	};
	statsCollector?: {
		startPeriodicFlush(intervalMs?: number): void;
		stopPeriodicFlush(): void;
	};
}
