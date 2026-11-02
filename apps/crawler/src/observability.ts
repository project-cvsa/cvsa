import { crawlerEnv } from "@cvsa/env";
import { initOtelSdk } from "@cvsa/observability";
import type { CrawlerObservability } from "./crawler/shared/types";

let sdk: ReturnType<typeof initOtelSdk> | undefined;

export const crawlerObservability: CrawlerObservability = {
	async init() {
		sdk ??= initOtelSdk({
			serviceName: crawlerEnv.OTEL_SERVICE_NAME,
			serviceVersion: crawlerEnv.OTEL_SERVICE_VERSION,
			nodeEnv: crawlerEnv.NODE_ENV,
			otlpEndpoint: crawlerEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
		await sdk;
	},
	async shutdown() {
		await (await sdk)?.shutdown();
	},
};
