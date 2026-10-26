export interface NetworkSchedulerLogger {
	info(message: string, attrs?: Record<string, unknown>): void;
	warn(message: string, attrs?: Record<string, unknown>): void;
	error(message: string, attrs?: Record<string, unknown>): void;
	debug?(message: string, attrs?: Record<string, unknown>): void;
	trace?(message: string, attrs?: Record<string, unknown>): void;
}

export function createNoopNetworkSchedulerLogger(): NetworkSchedulerLogger {
	return {
		info() {},
		warn() {},
		error() {},
	};
}
