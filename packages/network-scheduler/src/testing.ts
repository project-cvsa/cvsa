import type { NetworkRateLimiter } from "./contracts";

export function createFakeNetworkRateLimiter(): NetworkRateLimiter & { scopes: string[] } {
	const scopes: string[] = [];
	return {
		scopes,
		async consume(
			scope: string,
			_durationSeconds: number,
			_maxRequests: number
		): Promise<boolean> {
			scopes.push(scope);
			return true;
		},
	};
}

export class FakeRateLimiter implements NetworkRateLimiter {
	readonly scopes: string[] = [];
	private readonly rejectScopes: Set<string>;

	constructor(rejectScopes: string[] = []) {
		this.rejectScopes = new Set(rejectScopes);
	}

	async consume(scope: string, _durationSeconds: number, _maxRequests: number): Promise<boolean> {
		this.scopes.push(scope);
		return !this.rejectScopes.has(scope);
	}
}
