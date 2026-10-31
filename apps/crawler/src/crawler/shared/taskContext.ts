import { AsyncLocalStorage } from "node:async_hooks";

const tasks = new AsyncLocalStorage<AbortSignal | undefined>();

export class TaskDeadlineError extends Error {
	constructor() {
		super("Crawler task execution deadline exceeded");
		this.name = "TaskDeadlineError";
	}
}
export function getTaskSignal(): AbortSignal | undefined {
	return tasks.getStore();
}
export function assertTaskActive(): void {
	getTaskSignal()?.throwIfAborted();
}
export function activeTaskResource<T>(resource: T): T {
	assertTaskActive();
	return resource;
}

export async function runTaskWithDeadline<T>(
	timeoutMs: number,
	work: () => Promise<T>,
	parentSignal?: AbortSignal
): Promise<T> {
	const controller = new AbortController();
	const signal = parentSignal
		? AbortSignal.any([controller.signal, parentSignal])
		: controller.signal;
	signal.throwIfAborted();
	let abort: () => void = () => {};
	const deadline = new Promise<never>((_, reject) => {
		abort = () => reject(signal.reason);
		signal.addEventListener("abort", abort, { once: true });
	});
	const timer = setTimeout(() => controller.abort(new TaskDeadlineError()), timeoutMs);
	try {
		return await Promise.race([tasks.run(signal, work), deadline]);
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
		controller.abort(new Error("Crawler task finished"));
	}
}

export function outsideCrawlerTask<T>(work: () => Promise<T>): Promise<T> {
	return tasks.run(undefined, work);
}
