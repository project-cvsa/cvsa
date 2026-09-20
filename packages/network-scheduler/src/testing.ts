import type { NetworkRateLimiter } from "./contracts";

export interface RateLimiterCall {
	scope: string;
	durationSeconds: number;
	maxRequests: number;
}

/**
 * In-memory `NetworkRateLimiter` for tests and single-process use. It records
 * every `consume` call and rejects the scopes it was constructed with, so a test
 * can drive both the happy path and an exhausted budget.
 */
export class FakeRateLimiter implements NetworkRateLimiter {
	readonly scopes: string[] = [];
	readonly calls: RateLimiterCall[] = [];
	private readonly rejectScopes: Set<string>;

	constructor(rejectScopes: string[] = []) {
		this.rejectScopes = new Set(rejectScopes);
	}

	async consume(scope: string, durationSeconds: number, maxRequests: number): Promise<boolean> {
		this.scopes.push(scope);
		this.calls.push({ scope, durationSeconds, maxRequests });
		return !this.rejectScopes.has(scope);
	}
}
