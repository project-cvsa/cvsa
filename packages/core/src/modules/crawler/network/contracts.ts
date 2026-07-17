export type NetworkErrorCode =
	| "NO_AVAILABLE_ADAPTER"
	| "NETWORK_FAILURE"
	| "REQUEST_TIMEOUT"
	| "HTTP_429"
	| "HTTP_5XX"
	| "HTTP_4XX"
	| "BILIBILI_API_ERROR"
	| "RATE_LIMITED";

export interface NetworkRequest {
	url: string;
	requestType: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	timeoutMs?: number;
}

export interface NetworkResponse {
	adapterId: string;
	status: number;
	headers: Record<string, string>;
	body: string;
	durationMs: number;
	errorCode?: NetworkErrorCode;
}

export interface NetworkDelegate {
	execute(request: NetworkRequest): Promise<NetworkResponse>;
}

export interface NetworkAdapter {
	readonly id: string;
	execute(request: NetworkRequest): Promise<NetworkResponse>;
}

export interface NetworkTransport {
	execute(request: NetworkRequest, proxyUrl?: string): Promise<NetworkResponse>;
}

export interface NetworkRateLimiter {
	consume(scope: string, durationSeconds: number, maxRequests: number): Promise<boolean>;
	close?(): Promise<void>;
}
