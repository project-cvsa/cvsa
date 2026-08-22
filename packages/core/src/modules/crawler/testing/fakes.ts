import type { CrawlerMq, CrawlerProcessor, CrawlerQueue, CrawlerWorker } from "../shared/types";

export interface FakeMqState {
	connected: boolean;
	closed: boolean;
	queuedJobs: Array<{ queue: string; name: string; data: unknown }>;
	workerNames: string[];
}

export function createFakeMq(): CrawlerMq & { state: FakeMqState } {
	const state: FakeMqState = {
		connected: false,
		closed: false,
		queuedJobs: [],
		workerNames: [],
	};

	return {
		state,
		async connect(): Promise<void> {
			state.connected = true;
		},
		createQueue<T>(name: string): CrawlerQueue<T> {
			return {
				async add(jobName: string, data: T): Promise<void> {
					state.queuedJobs.push({ queue: name, name: jobName, data });
				},
				async close(): Promise<void> {},
			};
		},
		createWorker<T>(name: string, _processor: CrawlerProcessor<T>): CrawlerWorker {
			state.workerNames.push(name);
			return { async close(): Promise<void> {} };
		},
		async close(): Promise<void> {
			state.closed = true;
		},
	};
}

export interface FakeSnapshotDbState {
	connected: boolean;
	disconnected: boolean;
	healthChecks: number;
}

export function createFakeSnapshotDb(): FakeSnapshotDbState & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	healthCheck(): Promise<void>;
} {
	const state: FakeSnapshotDbState = {
		connected: false,
		disconnected: false,
		healthChecks: 0,
	};
	return Object.assign(state, {
		async connect(): Promise<void> {
			state.connected = true;
		},
		async disconnect(): Promise<void> {
			state.disconnected = true;
		},
		async healthCheck(): Promise<void> {
			state.healthChecks += 1;
		},
	});
}
