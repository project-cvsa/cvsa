export async function waitUntil(
	check: () => boolean | Promise<boolean>,
	description: string,
	timeoutMs = 4000
): Promise<void> {
	const deadline = performance.now() + timeoutMs;
	while (!(await check())) {
		if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
		await Bun.sleep(5);
	}
}
