import { dirname, join } from "node:path";
import { dev } from "astro";
import { fanee } from "@fanee/vite";
import type { Plugin } from "vite";

const root = process.argv[2];
if (!root) throw new Error("Expected the test project directory");
const resourceFile = join(root, "locale/messages/en.json");
let ready: Promise<void> = Promise.resolve();
let token = "";
const observe: Plugin = {
	name: "test-translation-watcher",
	configureServer(server) {
		token = server.config.webSocketToken;
		ready = new Promise((resolve) => {
			const finish = () => {
				server.watcher.off("ready", finish);
				resolve();
			};
			server.watcher.once("ready", finish);
			if (server.watcher.getWatched()[dirname(resourceFile)]?.includes("en.json")) finish();
		});
	},
};
const server = await dev({
	root,
	configFile: false,
	logLevel: "silent",
	devToolbar: { enabled: false },
	server: { host: "127.0.0.1", port: 0 },
	vite: { plugins: [observe, fanee({ bundlePath: "locale" })] },
});
await ready;
process.send?.({ port: server.address.port, token });
