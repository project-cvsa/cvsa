export interface NetworkSchedulerTracer {
	traceTask<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
}

export function createNoopNetworkSchedulerTracer(): NetworkSchedulerTracer {
	return {
		async traceTask<T>(_name: string, fn: () => T | Promise<T>): Promise<T> {
			return fn();
		},
	};
}
