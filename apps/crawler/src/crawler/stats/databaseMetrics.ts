import { traceTask } from "@cvsa/observability";
import { createNoopStatsRecorder, type StatsRecorder } from "./types";

export function createDatabaseTracer(
	stats: StatsRecorder = createNoopStatsRecorder(),
	module = "database"
) {
	return async <T>(name: string, operation: () => T | Promise<T>): Promise<T> => {
		const startedAt = performance.now();
		const operationName = name.startsWith(`${module}.`) ? name.slice(module.length + 1) : name;
		try {
			const result = await traceTask(name, operation);
			stats.recordDatabase(module, operationName, performance.now() - startedAt, "success");
			return result;
		} catch (error) {
			stats.recordDatabase(module, operationName, performance.now() - startedAt, "failure");
			throw error;
		}
	};
}
