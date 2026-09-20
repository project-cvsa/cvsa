import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/testing.ts"],
	format: "esm",
	dts: true,
	clean: true,
	deps: {
		neverBundle: ["zod", "ioredis", "axios"],
	},
});
