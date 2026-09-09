import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

export const solidI18n = (): AstroIntegration => ({
	name: "@cvsa/solid-i18n",
	hooks: {
		"astro:config:setup": ({ addRenderer }) => {
			addRenderer({
				name: "@cvsa/solid-i18n",
				clientEntrypoint: fileURLToPath(
					new URL("./solid-renderer.client.ts", import.meta.url)
				),
				serverEntrypoint: new URL("./solid-renderer.server.tsx", import.meta.url),
			});
		},
	},
});
