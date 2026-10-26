import { loadInferenceServerConfig } from "./config";
import { startInferenceServer } from "./server";

if (import.meta.main) {
	const config = loadInferenceServerConfig();
	const server = startInferenceServer(config);
	console.info(`Inference server listening on ${server.host}:${server.port}`);
	const shutdown = (): void => {
		void server.stop().catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Inference server shutdown failed: ${message}`);
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}
