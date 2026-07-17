import { env } from "@cvsa/env";
import pino, { stdTimeFunctions } from "pino";

export interface PinoLoggerOptions {
	level?: pino.Level;
	nodeEnv?: "development" | "test" | "production";
}

export function createPinoLogger(options: PinoLoggerOptions = {}): pino.Logger {
	const nodeEnv = options.nodeEnv ?? env.NODE_ENV;
	const isProduction = nodeEnv === "production";
	const isTest = nodeEnv === "test";

	const redact = ["authorization", "cookie", "password", "token"];

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
