import { SpanStatusCode, trace } from "@opentelemetry/api";
import pkg from "../package.json";

export const tracer = trace.getTracer(pkg.name, pkg.version);

export async function traceTask<T>(name: string, fn: () => T, startTime?: number): Promise<T> {
	return tracer.startActiveSpan(name, { startTime }, async (span) => {
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
