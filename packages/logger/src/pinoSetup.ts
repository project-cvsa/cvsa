import { env } from "@cvsa/env";
import pino, { stdTimeFunctions } from "pino";

export interface PinoLoggerOptions {
	level?: pino.Level;
	nodeEnv?: "development" | "test" | "production";
}

/**
 * pino redaction is the last line of defence, not the primary one: `appLogger`
 * already scrubs attributes through `sanitizeLogAttributes`. These paths exist
 * for direct `pinoLogger` callers and for anything that reaches pino without
 * going through the application logger.
 *
 * fast-redact paths are not recursive — `password` only matches the top level and
 * `*.password` only one level down — so the wildcard paths are enumerated.
 */
export const LOG_REDACT_PATHS: readonly string[] = [
	"authorization",
	"cookie",
	"password",
	"token",
	"proxyUrl",
	"proxy_url",
	"*.authorization",
	"*.cookie",
	"*.password",
	"*.token",
	"*.proxyUrl",
	"*.proxy_url",
	"*.*.authorization",
	"*.*.cookie",
	"*.*.password",
	"*.*.token",
	"*.*.proxyUrl",
	"*.*.proxy_url",
	"adapters[*].proxyUrl",
	"config.adapters[*].proxyUrl",
];

export function createPinoLogger(options: PinoLoggerOptions = {}): pino.Logger {
	const nodeEnv = options.nodeEnv ?? env.NODE_ENV;
	const isProduction = nodeEnv === "production";
	const isTest = nodeEnv === "test";

	const redact = [...LOG_REDACT_PATHS];

	const timestamp = stdTimeFunctions.isoTime;

	const baseOptions = {
		level: options.level ?? env.LOG_LEVEL ?? "info",
		redact,
		timestamp,
		formatters: {
			level: (label: string) => ({ level: label }),
		},
	};

	if (isProduction) {
		return pino(baseOptions);
	}

	if (isTest) {
		return pino({
			...baseOptions,
			level: options.level ?? "warn",
			transport: {
				target: "pino-pretty",
				options: { colorize: true },
			},
		});
	}

	return pino({
		...baseOptions,
		level: options.level ?? "debug",
		transport: {
			target: "pino-pretty",
			options: { colorize: true },
		},
	});
}

export const pinoLogger = createPinoLogger();
export { pino };
