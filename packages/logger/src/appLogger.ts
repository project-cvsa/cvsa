import type { Logger as PinoLogger } from "pino";
import { type Attributes, type AttributeValue, SpanStatusCode, trace } from "@opentelemetry/api";
import { type Logger, SeverityNumber } from "@opentelemetry/api-logs";
import { pinoLogger } from "./pinoSetup";
import { sanitizeLogAttributes, sanitizeLogMessage } from "./sanitize";
import { otelLogger } from "@cvsa/observability";
import { getLogContext } from "./context";

type PinoLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
type LogAttrs = Record<string, unknown> | undefined;

interface ApplicationLogger {
	trace(msg: string, attrs?: LogAttrs): void;
	debug(msg: string, attrs?: LogAttrs): void;
	info(msg: string, attrs?: LogAttrs): void;
	warn(msg: string, attrs?: LogAttrs): void;
	error(msg: string, attrs?: LogAttrs): void;
	fatal(msg: string, attrs?: LogAttrs): void;
}

const PINO_TO_OTEL_LEVEL: Record<PinoLevel, SeverityNumber> = {
	trace: SeverityNumber.TRACE,
	debug: SeverityNumber.DEBUG,
	info: SeverityNumber.INFO,
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	fatal: SeverityNumber.FATAL,
};

function getSpanContext(): { traceId: string | undefined; spanId: string | undefined } {
	const activeSpan = trace.getActiveSpan();
	if (!activeSpan) {
		return { traceId: undefined, spanId: undefined };
	}
	const spanContext = activeSpan.spanContext();
	return {
		traceId: spanContext.traceId || undefined,
		spanId: spanContext.spanId || undefined,
	};
}

function isAttributeValue(value: unknown): value is AttributeValue {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return true;
	}
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				typeof item === "string" || typeof item === "number" || typeof item === "boolean"
		)
	);
}

/** Keeps only the values OpenTelemetry can carry on an event or log record. */
function toAttributes(attributes: Record<string, unknown> | undefined): Attributes {
	const converted: Attributes = {};
	if (!attributes) return converted;
	for (const [key, value] of Object.entries(attributes)) {
		if (isAttributeValue(value)) converted[key] = value;
	}
	return converted;
}

function readError(attributes: Record<string, unknown> | undefined): Error | undefined {
	if (!attributes || !("error" in attributes)) return undefined;
	const value = attributes.error;
	return value instanceof Error ? value : undefined;
}

function createLogMethod(level: PinoLevel) {
	return function logMethod(
		pinoLogger: PinoLogger,
		otelLogger: Logger | undefined,
		msg: string,
		attrs?: LogAttrs
	): void {
		const { traceId, spanId } = getSpanContext();
		const activeSpan = trace.getActiveSpan();

		const spanContextAttrs =
			traceId && spanId ? { trace_id: traceId, span_id: spanId } : undefined;

		const ambientAttrs = getLogContext();

		// Scrub credentials before they reach any sink: the pino line, the
		// OpenTelemetry log record, and the active span event.
		const sanitizedAttrs = sanitizeLogAttributes({
			...ambientAttrs,
			...attrs,
		});
		const message = sanitizeLogMessage(msg);

		const mergedAttrs = {
			...sanitizedAttrs,
			...spanContextAttrs,
		};

		const error = readError(sanitizedAttrs);

		// pino merges its FIRST argument into the record; later arguments are
		// printf placeholders, so passing attributes second silently drops them.
		const pinoMethod = pinoLogger[level].bind(pinoLogger) as (
			mergingObject: Record<string, unknown>,
			message: string
		) => void;
		pinoMethod(error ? { ...mergedAttrs, err: error } : mergedAttrs, message);

		if (otelLogger) {
			const otelAttrs: Attributes = {
				...toAttributes(sanitizedAttrs),
				...toAttributes(spanContextAttrs),
			};
			if (error) {
				otelAttrs["error.object"] = String(error);
			}

			otelLogger.emit({
				severityText: level,
				severityNumber: PINO_TO_OTEL_LEVEL[level],
				body: message,
				attributes: otelAttrs,
			});
		}

		if (activeSpan) {
			activeSpan.addEvent(message, toAttributes(sanitizedAttrs));

			if (level === "error" || level === "fatal") {
				activeSpan.setStatus({ code: SpanStatusCode.ERROR, message });
			}
		}
	};
}

export function createApplicationLogger(
	pinoLogger: PinoLogger,
	otelLogger: Logger | undefined
): ApplicationLogger {
	const traceMethod = createLogMethod("trace");
	const debugMethod = createLogMethod("debug");
	const infoMethod = createLogMethod("info");
	const warnMethod = createLogMethod("warn");
	const errorMethod = createLogMethod("error");
	const fatalMethod = createLogMethod("fatal");

	return {
		trace(msg: string, attrs?: LogAttrs): void {
			traceMethod(pinoLogger, otelLogger, msg, attrs);
		},
		debug(msg: string, attrs?: LogAttrs): void {
			debugMethod(pinoLogger, otelLogger, msg, attrs);
		},
		info(msg: string, attrs?: LogAttrs): void {
			infoMethod(pinoLogger, otelLogger, msg, attrs);
		},
		warn(msg: string, attrs?: LogAttrs): void {
			warnMethod(pinoLogger, otelLogger, msg, attrs);
		},
		error(msg: string, attrs?: LogAttrs): void {
			errorMethod(pinoLogger, otelLogger, msg, attrs);
		},
		fatal(msg: string, attrs?: LogAttrs): void {
			fatalMethod(pinoLogger, otelLogger, msg, attrs);
		},
	};
}

export const appLogger = createApplicationLogger(pinoLogger, otelLogger);
