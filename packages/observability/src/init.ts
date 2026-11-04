import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import {
	AggregationTemporality,
	AggregationType,
	PeriodicExportingMetricReader,
	type AggregationOption,
	type InstrumentType,
	type PushMetricExporter,
	type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { env } from "@cvsa/env";

export interface OtelSdkOptions {
	serviceName?: string;
	serviceVersion?: string;
	nodeEnv?: string;
	otlpEndpoint?: string;
	serviceInstanceId?: string;
	onMetricExport?: (result: { success: boolean; durationMs: number; error?: Error }) => void;
}

class ObservedMetricExporter implements PushMetricExporter {
	constructor(
		private readonly inner: PushMetricExporter,
		private readonly onResult: (result: {
			success: boolean;
			durationMs: number;
			error?: Error;
		}) => void
	) {}

	export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
		const startedAt = performance.now();
		this.inner.export(metrics, (result) => {
			this.onResult({
				success: result.code === ExportResultCode.SUCCESS,
				durationMs: performance.now() - startedAt,
				error: result.error,
			});
			resultCallback(result);
		});
	}

	forceFlush(): Promise<void> {
		return this.inner.forceFlush();
	}

	shutdown(): Promise<void> {
		return this.inner.shutdown();
	}

	selectAggregationTemporality?(instrumentType: InstrumentType): AggregationTemporality {
		return (
			this.inner.selectAggregationTemporality?.(instrumentType) ??
			AggregationTemporality.CUMULATIVE
		);
	}

	selectAggregation?(instrumentType: InstrumentType): AggregationOption {
		return this.inner.selectAggregation?.(instrumentType) ?? { type: AggregationType.DEFAULT };
	}
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
		"service.instance.id": options.serviceInstanceId ?? crypto.randomUUID(),
		"service.version": options.serviceVersion ?? env.OTEL_SERVICE_VERSION,
		"deployment.environment": options.nodeEnv ?? env.NODE_ENV ?? "development",
	});

	const endpoints = resolveOtlpSignalEndpoints(rawEndpoint);
	if (endpoints.metrics) diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

	const traceExporter = endpoints.traces
		? new OTLPTraceExporter({ url: endpoints.traces })
		: undefined;

	const metricExporter = endpoints.metrics
		? new OTLPMetricExporter({ url: endpoints.metrics })
		: undefined;
	const observedExporter =
		metricExporter && options.onMetricExport
			? new ObservedMetricExporter(metricExporter, options.onMetricExport)
			: metricExporter;
	const metricReader =
		observedExporter && endpoints.metrics
			? new PeriodicExportingMetricReader({
					exporter: observedExporter,
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
		spanProcessors: traceExporter ? [new BatchSpanProcessor(traceExporter)] : [],
		metricReaders: metricReader ? [metricReader] : [],
		logRecordProcessors: logRecordProcessor ? [logRecordProcessor] : [],
		views: endpoints.metrics
			? [
					{
						instrumentName: "cvsa.crawler.duration_ms",
						aggregation: {
							type: AggregationType.EXPONENTIAL_HISTOGRAM,
							options: { maxSize: 2048, recordMinMax: true },
						},
					},
				]
			: [],
	});

	sdk.start();
	return sdk;
}

export function getOtelLogger(scopeName = "@cvsa/logger"): ReturnType<typeof logs.getLogger> {
	return logs.getLogger(scopeName);
}

export const otelLogger = getOtelLogger();
