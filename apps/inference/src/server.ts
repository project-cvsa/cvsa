import { InferenceEngine } from "./engine";
import type { InferenceServerConfig } from "./config";
import { createInferenceApp } from "./http";

export type RunningInferenceServer = {
	engine: InferenceEngine;
	host: string;
	port: number;
	stop: () => Promise<void>;
};

export function startInferenceServer(config: InferenceServerConfig): RunningInferenceServer {
	const engine = new InferenceEngine(config);
	const app = createInferenceApp(engine);
	app.listen({ hostname: config.host, port: config.port });
	const initialization = engine.initialize();
	void initialization.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Inference engine initialization failed: ${message}`);
	});
	let stopPromise: Promise<void> | undefined;
	return {
		engine,
		host: config.host,
		port: config.port,
		stop: () => {
			if (!stopPromise) {
				stopPromise = app.stop().then(async () => {
					await engine.close();
				});
			}
			return stopPromise;
		},
	};
}
