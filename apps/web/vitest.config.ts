import { fanee } from "@fanee/vite";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
	test: {},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		solid({ ssr: true }),
		fanee({
			bundlePath: "../../locale",
		}),
	],
});
