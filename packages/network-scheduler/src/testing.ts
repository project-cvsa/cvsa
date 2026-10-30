import type { NetworkRateLimiter } from "./contracts";

export interface RateLimiterCall {
	scope: string;
	durationSeconds: number;
	maxRequests: number;
}

/**
 * Deterministic test double for routing and circuit-breaker tests.
 * Admission refuses configured scopes; cooldowns use the injected clock.
 * Rate enforcement itself is covered against Redis.
 */
export class FakeRateLimiter implements NetworkRateLimiter {
	readonly scopes: string[] = [];
	readonly calls: RateLimiterCall[] = [];
	private readonly rejectScopes: Set<string>;
	private readonly cooldowns = new Map<string, number>();

	constructor(
		rejectScopes: string[] = [],
		private readonly clock: () => number = Date.now
	) {
		this.rejectScopes = new Set(rejectScopes);
	}

	async reserve(
		scope: string,
		budgets: ReadonlyArray<{ scope?: string; durationSeconds: number; maxRequests: number }>
	): Promise<number> {
		const refused = budgets.find((budget) => this.rejectScopes.has(budget.scope ?? scope));
		return refused ? Math.ceil((refused.durationSeconds * 1000) / refused.maxRequests) : 0;
	}
	async defer(scope: string, delayMs: number): Promise<void> {
		this.cooldowns.set(scope, Math.max(this.cooldowns.get(scope) ?? 0, this.clock() + delayMs));
	}
	async remainingDelay(scope: string): Promise<number> {
		return Math.max(0, (this.cooldowns.get(scope) ?? 0) - this.clock());
	}

	async consume(scope: string, durationSeconds: number, maxRequests: number): Promise<boolean> {
		this.scopes.push(scope);
		this.calls.push({ scope, durationSeconds, maxRequests });
		return !this.rejectScopes.has(scope);
	}
}
