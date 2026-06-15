import { SpanStatusCode, trace, context } from "@opentelemetry/api";
import pkg from "../../package.json";

export const tracer = trace.getTracer(pkg.name, pkg.version);

export async function traceTask<T>(name: string, fn: () => T): Promise<T> {
	return tracer.startActiveSpan(name, async (span) => {
		try {
			span.setStatus({ code: SpanStatusCode.OK });
			return await fn();
		} catch (e) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			throw e;
		} finally {
			span.end();
		}
	});
}

export const getTraceId = () => {
	const currentSpan = trace.getSpan(context.active());

	if (currentSpan) {
		const spanContext = currentSpan.spanContext();

		return spanContext.traceId;
	}
};
