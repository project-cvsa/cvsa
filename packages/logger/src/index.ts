export { pinoLogger } from "./pinoSetup";
export { createPinoLogger } from "./pinoSetup";
export { appLogger, createApplicationLogger } from "./appLogger";

export type {
	Severity,
	LogAttributes,
	RequestLogAttrs,
	ApplicationLogger,
	RequestLogger,
	OtelSdkInitResult,
} from "./types";

export type { PinoLoggerOptions } from "./pinoSetup";
