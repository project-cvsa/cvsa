// @ts-check
import { defineConfig } from "astro/config";
import UnoCSS from "unocss/astro";
import solid from "@astrojs/solid-js";
import node from "@astrojs/node";
import { fanee } from "@fanee/vite";

export default defineConfig({
	integrations: [UnoCSS({ injectReset: true }), solid()],
	adapter: node({
		mode: "standalone",
	}),
	vite: {
		plugins: [
			fanee({
				bundlePath: "../../locale",
			}),
		],
		server: {
			allowedHosts: ['.projectcvsa.com'],
		},
	},
	devToolbar: {
		enabled: false,
	},
	output: "server",
});
