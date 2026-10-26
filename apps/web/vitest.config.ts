import { fanee } from "@fanee/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		fanee({
			bundlePath: "../../locale",
		}),
	],
});
