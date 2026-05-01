export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startIndexScheduler } = await import("./lib/index-scheduler");
		startIndexScheduler();
	}
}
