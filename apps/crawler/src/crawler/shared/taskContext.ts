import { AsyncLocalStorage } from "node:async_hooks";

const tasks = new AsyncLocalStorage<AbortSignal>();

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
	work: () => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const error = new TaskDeadlineError();
			controller.abort(error);
			reject(error);
		}, timeoutMs);
	});
	try {
		return await Promise.race([tasks.run(controller.signal, work), deadline]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
