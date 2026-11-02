import { traceTask } from "@cvsa/observability";
import { createNoopStatsRecorder, type StatsRecorder } from "./types";

export function createDatabaseTracer(stats: StatsRecorder = createNoopStatsRecorder()) {
	return async <T>(name: string, operation: () => T | PromiseLike<T>): Promise<T> =>
		traceTask(name, async () => {
			try {
				return await operation();
			} catch (error) {
				stats.recordError("dbError");
				throw error;
			}
		});
}
