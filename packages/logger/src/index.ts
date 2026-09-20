export { LOG_REDACT_PATHS, pinoLogger } from "./pinoSetup";
export { createPinoLogger } from "./pinoSetup";
export { appLogger, createApplicationLogger } from "./appLogger";
export {
	REDACTED_LOG_VALUE,
	isCredentialKey,
	sanitizeLogAttributes,
	sanitizeLogMessage,
} from "./sanitize";

export type {
	Severity,
	LogAttributes,
	RequestLogAttrs,
	ApplicationLogger,
	RequestLogger,
	OtelSdkInitResult,
} from "./types";

export type { PinoLoggerOptions } from "./pinoSetup";
