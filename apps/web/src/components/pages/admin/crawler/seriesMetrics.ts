/**
 * Label each persisted rollup counter the console knows how to name.
 *
 * Rollups are stored as nested groups and flattened for the wire, so a counter
 * arrives as `counters.jobsCompleted`; the bare key is accepted as a fallback.
 */
const SERIES_METRICS: ReadonlyArray<{ paths: readonly string[]; label: string }> = [
	{ paths: ["counters.jobsCompleted", "jobsCompleted"], label: "Jobs" },
	{ paths: ["counters.snapshotsSaved", "snapshotsSaved"], label: "Snapshots" },
	{ paths: ["counters.candidatesScanned", "candidatesScanned"], label: "Candidates" },
	{ paths: ["counters.inferencesRun", "inferencesRun"], label: "Inferences" },
	{ paths: ["counters.networkRequests", "networkRequests"], label: "Requests" },
	{ paths: ["retries"], label: "Retries" },
];

/** Counter summaries for one rollup bucket; unknown keys are not rendered. */
export function readSeriesMetrics(
	metrics: Record<string, number>
): Array<{ label: string; value: number }> {
	return SERIES_METRICS.flatMap(({ paths, label }) => {
		for (const path of paths) {
			const value = metrics[path];
			if (typeof value === "number") return [{ label, value }];
		}
		return [];
	});
}
