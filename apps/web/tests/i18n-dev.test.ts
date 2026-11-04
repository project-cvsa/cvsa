import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("Astro refreshes SSR output and inline client resources after a translation changes", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "cvsa-i18n-")));
	let worker: ChildProcess | undefined;
	let socket: WebSocket | undefined;
	try {
		await mkdir(join(root, "src/pages"), { recursive: true });
		await mkdir(join(root, "locale/messages"), { recursive: true });
		await symlink(
			fileURLToPath(new URL("../node_modules", import.meta.url)),
			join(root, "node_modules"),
			"dir"
		);
		await writeFile(
			join(root, "package.json"),
			JSON.stringify({ name: "i18n-test", private: true, type: "module" })
		);
		await writeFile(
			join(root, "locale/manifest.json"),
			JSON.stringify({ format: "otb", specVersion: "0.4.0" })
		);
		const resourceFile = join(root, "locale/messages/en.json");
		await writeFile(resourceFile, JSON.stringify({ greeting: "Before" }));
		await writeFile(
			join(root, "src/i18n.js"),
			'import { resources } from "virtual:fanee"; export const greeting = resources[""].en.greeting;'
		);
		await writeFile(
			join(root, "src/pages/index.astro"),
			'---\nimport { greeting } from "../i18n.js";\n---\n<p>{greeting}</p><script type="application/json" is:inline set:html={JSON.stringify({ greeting })}></script>'
		);
		const child = fork(fileURLToPath(new URL("./i18n/astroDev.ts", import.meta.url)), [root], {
			execPath: process.execPath,
			stdio: ["ignore", "pipe", "pipe", "ipc"],
			env: {
				...process.env,
				VITEST: undefined,
				NODE_ENV: "development",
				ASTRO_TELEMETRY_DISABLED: "1",
			},
		});
		worker = child;
		let output = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		const { port, token } = await new Promise<{ port: number; token: string }>(
			(resolve, reject) => {
				child.once("error", reject);
				child.once("exit", () =>
					reject(new Error(output || "Astro exited before starting"))
				);
				child.on("message", (message: unknown) => {
					if (
						typeof message !== "object" ||
						message === null ||
						!("port" in message) ||
						!("token" in message)
					)
						return;
					if (typeof message.port === "number" && typeof message.token === "string")
						resolve({ port: message.port, token: message.token });
				});
			}
		);
		const url = `http://127.0.0.1:${port}`;
		const before = await (await fetch(url)).text();
		expect(before).toContain("<p>Before</p>");
		expect(before).toContain('{"greeting":"Before"}');
		const client = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`, "vite-hmr");
		socket = client;
		await new Promise<void>((resolve, reject) => {
			client.addEventListener("error", () => reject(new Error("HMR connection failed")));
			client.addEventListener("message", () => resolve(), { once: true });
		});
		const reloaded = new Promise<void>((resolve, reject) => {
			client.addEventListener("message", (event) => {
				const payload: unknown = JSON.parse(String(event.data));
				if (typeof payload !== "object" || payload === null || !("type" in payload)) return;
				if (payload.type === "error") reject(new Error(JSON.stringify(payload)));
				if (payload.type === "full-reload") resolve();
			});
		});
		await writeFile(resourceFile, JSON.stringify({ greeting: "After" }));
		await reloaded;
		const after = await (await fetch(url)).text();
		expect(after).toContain("<p>After</p>");
		expect(after).toContain('{"greeting":"After"}');
	} finally {
		socket?.close();
		if (worker && worker.exitCode === null && worker.signalCode === null) {
			const exited = once(worker, "exit");
			worker.kill();
			await exited;
		}
		await rm(root, { recursive: true, force: true });
	}
}, 15000);
