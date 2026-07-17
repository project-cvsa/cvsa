import type { JobsOptions, WorkerOptions } from "bullmq";

export interface CrawlerJob<T> {
	id: string | undefined;
	data: T;
}

export type CrawlerProcessor<T> = (job: CrawlerJob<T>) => Promise<void>;

export interface CrawlerQueue<T> {
	add(name: string, data: T, options?: JobsOptions): Promise<void>;
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
}
