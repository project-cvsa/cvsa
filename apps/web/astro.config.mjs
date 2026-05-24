// @ts-check
import { defineConfig } from "astro/config";
import UnoCSS from "unocss/astro";
import solid from "@astrojs/solid-js";
import node from "@astrojs/node";
import ssrCopyPlugin from "@lib/copy-plugin";

export default defineConfig({
	integrations: [UnoCSS({ injectReset: true }), solid()],
	adapter: node({
		mode: "standalone",
	}),
	vite: {
		plugins: [
			ssrCopyPlugin({
				src: "../../locale",
				dest: "locale",
			}),
		],
	},
	devToolbar: {
		enabled: false,
	},
	output: "server",
});
