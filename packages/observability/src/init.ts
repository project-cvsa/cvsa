import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { env } from "@cvsa/env";

export interface OtelSdkOptions {
	serviceName?: string;
	serviceVersion?: string;
	nodeEnv?: string;
	otlpEndpoint?: string;
}

function resolveOtlpSignalEndpoints(rawEndpoint: string | undefined): {
	traces?: string;
	metrics?: string;
	logs?: string;
} {
	if (!rawEndpoint) return {};
	const trimmed = rawEndpoint.trim().replace(/\/+$/, "");
	// Strip trailing /v1/(traces|metrics|logs) if provided by user
	const baseUrl = trimmed.replace(/\/v1\/(traces|metrics|logs)$/, "");
	return {
		traces: `${baseUrl}/v1/traces`,
		metrics: `${baseUrl}/v1/metrics`,
		logs: `${baseUrl}/v1/logs`,
	};
}

export async function initOtelSdk(options: OtelSdkOptions = {}): Promise<NodeSDK> {
	const rawEndpoint =
		options.otlpEndpoint ??
		env.OTEL_EXPORTER_OTLP_ENDPOINT ??
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

	const resource = resourceFromAttributes({
		"service.name": options.serviceName ?? env.OTEL_SERVICE_NAME,
		"service.version": options.serviceVersion ?? env.OTEL_SERVICE_VERSION,
		"deployment.environment": options.nodeEnv ?? env.NODE_ENV ?? "development",
	});

	const endpoints = resolveOtlpSignalEndpoints(rawEndpoint);

	const traceExporter = endpoints.traces
		? new OTLPTraceExporter({ url: endpoints.traces })
		: undefined;

	const metricReader = endpoints.metrics
		? new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({ url: endpoints.metrics }),
				exportIntervalMillis: 15_000,
			})
		: undefined;

	const logRecordProcessor = endpoints.logs
		? new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({ url: endpoints.logs }),
			})
		: undefined;

	const sdk = new NodeSDK({
		resource,
		...(traceExporter ? { traceExporter } : {}),
		...(metricReader ? { metricReader } : {}),
		...(logRecordProcessor ? { logRecordProcessors: [logRecordProcessor] } : {}),
	});

	sdk.start();
	return sdk;
}

export function getOtelLogger(serviceName?: string): ReturnType<typeof logs.getLogger> {
	return logs.getLogger(serviceName ?? env.OTEL_SERVICE_NAME ?? "cvsa");
}

export const otelLogger = getOtelLogger();
