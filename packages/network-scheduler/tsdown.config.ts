import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	dts: true,
	clean: true,
	deps: {
		neverBundle: ["zod", "ioredis", "node-fetch", "proxy-agent"],
	},
});
