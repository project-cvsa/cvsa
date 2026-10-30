export class RetryLaterError extends Error {
	constructor(
		readonly delayMs = 1000,
		readonly reason: "local_capacity" | "upstream" | "network_recovery" = "upstream",
		readonly applicationCode?: number,
		readonly applicationMessage?: string
	) {
		super(
			reason === "upstream"
				? "Upstream throttled; retry later"
				: reason === "network_recovery"
					? "Waiting for network adapter recovery"
					: "Waiting for local request capacity"
		);
		this.name = "RetryLaterError";
	}
}
