import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { env } from "@cvsa/env";

export interface OtelSdkOptions {
	serviceName?: string;
	serviceVersion?: string;
	nodeEnv?: string;
	otlpEndpoint?: string;
}

export async function initOtelSdk(options: OtelSdkOptions = {}): Promise<NodeSDK> {
	const endpoint =
		options.otlpEndpoint ??
		env.OTEL_EXPORTER_OTLP_ENDPOINT ??
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

	const resource = resourceFromAttributes({
		"service.name": options.serviceName ?? env.OTEL_SERVICE_NAME,
		"service.version": options.serviceVersion ?? env.OTEL_SERVICE_VERSION,
		"deployment.environment": options.nodeEnv ?? env.NODE_ENV ?? "development",
	});

	const traceExporter = endpoint ? new OTLPTraceExporter({ url: endpoint }) : undefined;

	const sdk = new NodeSDK({
		resource,
		...(traceExporter ? { traceExporter } : {}),
	});

	sdk.start();
	return sdk;
}

export function getOtelLogger(serviceName?: string): ReturnType<typeof logs.getLogger> {
	return logs.getLogger(serviceName ?? env.OTEL_SERVICE_NAME ?? "cvsa");
}

export const otelLogger = getOtelLogger();
