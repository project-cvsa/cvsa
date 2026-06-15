export type Severity = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogAttributes extends Record<string, unknown> {
	userId?: string;
	requestId?: string;
	traceId?: string;
	spanId?: string;
	[key: string]: unknown;
}

export interface RequestLogAttrs {
	method: string;
	path: string;
	status: number;
	latency: string;
	query?: Record<string, string>;
	userAgent?: string;
	ip?: string;
	requestBody?: unknown;
}

export interface ApplicationLogger {
	trace(msg: string, attrs?: LogAttributes): void;
	debug(msg: string, attrs?: LogAttributes): void;
	info(msg: string, attrs?: LogAttributes): void;
	warn(msg: string, attrs?: LogAttributes): void;
	error(msg: string, attrs?: LogAttributes): void;
	fatal(msg: string, attrs?: LogAttributes): void;
	child(initialAttrs: LogAttributes): ApplicationLogger;
}

export interface RequestLogger {
	log(request: RequestInfo, response: ResponseInfo, duration: number): void;
}

export interface RequestInfo {
	method: string;
	path: string;
	query: Record<string, string>;
	headers: Headers;
	body: unknown;
}

export interface ResponseInfo {
	status: number;
	body: unknown;
}

export interface OtelSdkInitResult {
	isAvailable: boolean;
	reason?: string;
}
