export interface NetworkMetrics {
	requests: {
		add(value: number, attributes: Record<string, string | number>): void;
	};
	requestDurationMs: {
		record(value: number, attributes: Record<string, string | number>): void;
	};
	scheduleAttempts: {
		record(value: number, attributes: Record<string, string | number>): void;
	};
}

export function createNoopNetworkMetrics(): NetworkMetrics {
	return {
		requests: { add() {} },
		requestDurationMs: { record() {} },
		scheduleAttempts: { record() {} },
	};
}
