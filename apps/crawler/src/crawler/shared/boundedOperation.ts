import { getTaskSignal } from "./taskContext";

export async function boundedOperation<T>(
	work: () => Promise<T>,
	timeoutMs: number,
	signal: AbortSignal | undefined = getTaskSignal()
): Promise<T> {
	signal?.throwIfAborted();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: () => void = () => {};
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("Crawler operation timed out")), timeoutMs);
		onAbort = () =>
			reject(
				signal?.reason instanceof Error
					? signal.reason
					: new Error("Crawler operation cancelled")
			);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
	try {
		return await Promise.race([work(), deadline]);
	} finally {
		if (timer) clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
}
