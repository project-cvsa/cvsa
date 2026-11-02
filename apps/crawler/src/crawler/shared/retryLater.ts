export class RetryLaterError extends Error {
	constructor(
		readonly delayMs = 1000,
		readonly reason:
			| "local_capacity"
			| "upstream"
			| "network_recovery"
			| "task_retry" = "upstream",
		readonly applicationCode?: number,
		readonly applicationMessage?: string
	) {
		super(
			reason === "upstream"
				? "Upstream throttled; retry later"
				: reason === "network_recovery"
					? "Waiting for network adapter recovery"
					: reason === "task_retry"
						? "Waiting to retry the current task"
						: "Waiting for local request capacity"
		);
		this.name = "RetryLaterError";
	}
}
