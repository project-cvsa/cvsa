export type NetworkSchedulerErrorCode = "NO_AVAILABLE_ADAPTER";

export class NetworkSchedulerError extends Error {
	constructor(
		message: string,
		public readonly code: NetworkSchedulerErrorCode,
		public readonly statusCode: number = 500
	) {
		super(message);
		this.name = "NetworkSchedulerError";
	}
}
