import { crawlerEnv } from "@cvsa/env";
import { initOtelSdk } from "@cvsa/observability";
import type { CrawlerObservability } from "./crawler/shared/types";
import { crawlerExportObservation } from "./crawler/stats/exportState";

export function createCrawlerObservability(serviceInstanceId: string): CrawlerObservability {
	let sdk: ReturnType<typeof initOtelSdk> | undefined;
	return {
		async init() {
			crawlerExportObservation.setEnabled(Boolean(crawlerEnv.OTEL_EXPORTER_OTLP_ENDPOINT));
			sdk ??= initOtelSdk({
				serviceName: crawlerEnv.OTEL_SERVICE_NAME,
				serviceVersion: crawlerEnv.OTEL_SERVICE_VERSION,
				nodeEnv: crawlerEnv.NODE_ENV,
				otlpEndpoint: crawlerEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
				serviceInstanceId,
				onMetricExport: (result) =>
					crawlerExportObservation.record(
						result.success,
						result.durationMs,
						result.error
					),
			});
			await sdk;
		},
		async shutdown() {
			await (await sdk)?.shutdown();
		},
	};
}
