import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { env } from "@cvsa/env";

export async function initOtelSdk() {
	const resource = resourceFromAttributes({
		"service.name": env.OTEL_SERVICE_NAME,
		"service.version": env.OTEL_SERVICE_VERSION,
		"deployment.environment": env.NODE_ENV ?? "development",
	});

	const sdk = new NodeSDK({
		resource,
	});

	sdk.start();
}

export const otelLogger = logs.getLogger(env.OTEL_SERVICE_NAME || "cvsa");
