import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import pkg from "../package.json";

export const tracer = trace.getTracer(pkg.name, pkg.version);

export interface TraceTaskOptions {
	attributes?: Attributes;
	startTime?: number;
}

export async function traceTask<T>(
	name: string,
	fn: (span: Span) => T | Promise<T>,
	options?: TraceTaskOptions | number
): Promise<T> {
	const opts: TraceTaskOptions =
		typeof options === "number" ? { startTime: options } : (options ?? {});
	return tracer.startActiveSpan(name, { startTime: opts.startTime }, async (span) => {
		if (opts.attributes) {
			span.setAttributes(opts.attributes);
		}
		try {
			span.setStatus({ code: SpanStatusCode.OK });
			return await fn(span);
		} catch (e) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: e instanceof Error ? e.message : String(e),
			});
			if (e instanceof Error) {
				span.recordException(e);
			}
			throw e;
		} finally {
			span.end();
		}
	});
}
