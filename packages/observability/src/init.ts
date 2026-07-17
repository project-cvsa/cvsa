import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { env } from "@cvsa/env";

export interface OtelSdkOptions {
	serviceName?: string;
	serviceVersion?: string;
	nodeEnv?: string;
}

export async function initOtelSdk(options: OtelSdkOptions = {}): Promise<NodeSDK> {
	const resource = resourceFromAttributes({
		"service.name": options.serviceName ?? env.OTEL_SERVICE_NAME,
		"service.version": options.serviceVersion ?? env.OTEL_SERVICE_VERSION,
		"deployment.environment": options.nodeEnv ?? env.NODE_ENV ?? "development",
	});

	const sdk = new NodeSDK({
		resource,
	});

	sdk.start();
	return sdk;
}

export function createOtelLogger(serviceName: string): ReturnType<typeof logs.getLogger> {
	return logs.getLogger(serviceName);
}

export const otelLogger = createOtelLogger(env.OTEL_SERVICE_NAME || "cvsa");
