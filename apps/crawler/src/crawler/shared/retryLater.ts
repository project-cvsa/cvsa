export class RetryLaterError extends Error {
	constructor(
		readonly delayMs = 1000,
		readonly reason: "local_capacity" | "upstream" = "upstream"
	) {
		super(
			reason === "upstream"
				? "Upstream throttled; retry later"
				: "Waiting for local request capacity"
		);
		this.name = "RetryLaterError";
	}
}
