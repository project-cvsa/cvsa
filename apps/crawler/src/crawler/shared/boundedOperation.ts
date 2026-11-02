import { TaskDeadlineError, getTaskSignal } from "./taskContext";

export class OperationTimeoutError extends Error {
	constructor() {
		super("Crawler operation timed out");
		this.name = "OperationTimeoutError";
	}
}

export class OperationCancelledError extends Error {
	constructor(reason?: string) {
		super(reason ?? "Crawler operation cancelled");
		this.name = "OperationCancelledError";
	}
}

export async function boundedOperation<T>(
	work: () => Promise<T>,
	timeoutMs: number,
	signal: AbortSignal | undefined = getTaskSignal()
): Promise<T> {
	signal?.throwIfAborted();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: () => void = () => {};
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new OperationTimeoutError()), timeoutMs);
		onAbort = () => {
			const reason = signal?.reason;
			if (reason instanceof TaskDeadlineError) {
				reject(reason);
				return;
			}
			reject(
				new OperationCancelledError(reason instanceof Error ? reason.message : undefined)
			);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
	try {
		return await Promise.race([work(), deadline]);
	} finally {
		if (timer) clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}
