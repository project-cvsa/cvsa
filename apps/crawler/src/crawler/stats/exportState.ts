import type { CrawlerStatsExportState } from "@cvsa/contracts";
import { createSketch, serializeSketch, summarizeSketch } from "./sketch";

export class ExportObservation {
	private readonly durations = createSketch();
	private successes = 0;
	private failures = 0;
	private lastSuccessAt: number | null = null;
	private lastResult: "success" | "failure" | "not_exported" = "not_exported";
	private lastError: string | null = null;
	private enabled = false;

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	record(success: boolean, durationMs: number, error?: Error): void {
		this.durations.accept(Math.max(0, durationMs));
		this.lastResult = success ? "success" : "failure";
		if (success) {
			this.successes++;
			this.lastSuccessAt = Date.now();
			this.lastError = null;
		} else {
			this.failures++;
			this.lastError = error?.message ?? "OTLP metric export failed";
		}
	}

	snapshot(): CrawlerStatsExportState {
		const duration = summarizeSketch(this.durations);
		return {
			enabled: this.enabled,
			successes: this.successes,
			failures: this.failures,
			lastSuccessAt:
				this.lastSuccessAt === null ? null : new Date(this.lastSuccessAt).toISOString(),
			durationMs: duration.count > 0 ? duration : null,
			lastResult: this.lastResult,
			lastError: this.lastError,
		};
	}

	/** Exposed for tests that need the raw serialized distribution. */
	distribution(): ReturnType<typeof serializeSketch> {
		return serializeSketch(this.durations);
	}
}

export const crawlerExportObservation = new ExportObservation();
