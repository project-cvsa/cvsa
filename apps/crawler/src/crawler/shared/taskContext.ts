import { AsyncLocalStorage } from "node:async_hooks";

const tasks = new AsyncLocalStorage<AbortSignal | undefined>();
const activeTasks = new Set<Promise<unknown>>();

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
	const workPromise = tasks.run(signal, work);
	activeTasks.add(workPromise);
	void workPromise.then(
		() => activeTasks.delete(workPromise),
		() => activeTasks.delete(workPromise)
	);
	try {
		return await Promise.race([workPromise, deadline]);
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", abort);
		controller.abort(new Error("Crawler task finished"));
	}
}

export function outsideCrawlerTask<T>(work: () => Promise<T>): Promise<T> {
	return tasks.run(undefined, work);
}

/**
 * Waits for work whose outer deadline has already rejected. Shutdown uses this
 * so a job is not reported finished while its database write is still running.
 */
export async function drainActiveTasks(timeoutMs: number): Promise<void> {
	if (activeTasks.size === 0) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, timeoutMs);
		timer.unref?.();
	});
	await Promise.race([Promise.allSettled([...activeTasks]).then(() => undefined), deadline]);
	if (timer) clearTimeout(timer);
}
