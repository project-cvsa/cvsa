import type { Logger as PinoLogger } from "pino";
import { type Logger, SeverityNumber } from "@opentelemetry/api-logs";
import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";
import { pinoLogger } from "./pinoSetup";
import { otelLogger } from "@cvsa/observability";

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

		const mergedAttrs = {
			...attrs,
			...spanContextAttrs,
		};

		const pinoMethod = pinoLogger[level].bind(pinoLogger) as (
			msg: string,
			...args: unknown[]
		) => void;
		if (level === "error" || level === "fatal") {
			const err = attrs && "error" in attrs ? (attrs.error as Error) : undefined;
			if (err instanceof Error) {
				pinoMethod(msg, {
					...mergedAttrs,
					err,
				});
			} else {
				pinoMethod(msg, mergedAttrs);
			}
		} else {
			pinoMethod(msg, mergedAttrs);
		}

		if (otelLogger) {
			const otelAttrs: Attributes = {
				...(attrs || {}),
				...(spanContextAttrs || {}),
			};

			if (level === "error" || level === "fatal") {
				const err = attrs && "error" in attrs ? (attrs.error as Error) : undefined;
				if (err) {
					otelAttrs["error.object"] = String(err);
				}
			}

			otelLogger.emit({
				severityText: level,
				severityNumber: PINO_TO_OTEL_LEVEL[level],
				body: msg,
				attributes: otelAttrs,
			});
		}

		if (activeSpan) {
			activeSpan.addEvent(msg, attrs as Attributes);

			if (level === "error" || level === "fatal") {
				activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: msg });
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
