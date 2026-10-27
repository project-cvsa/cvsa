#!/usr/bin/env bun
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number.parseInt(process.env.DEPLOY_PORT || "9420", 10);
const HOST = process.env.DEPLOY_HOST || "127.0.0.1";
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET?.trim() || "";
const SCRIPT_PATH = resolve(import.meta.dir, "deploy.sh");
const LOCK_DIR = resolve(import.meta.dir, "../.deploy.lock");
const STATE_FILE = resolve(import.meta.dir, "../.deploy.state.json");
const TAG_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MAX_BODY_BYTES = 16 * 1024;

function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function verifyAuth(req: Request, bodyText: string): boolean {
	if (!SECRET) return false;

	const authHeader = req.headers.get("authorization") || "";
	const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
	if (bearerMatch && safeCompare(bearerMatch[1], SECRET)) {
		return true;
	}

	const sigHeader = req.headers.get("x-hub-signature-256") || "";
	const sigMatch = /^sha256=([a-f0-9]{64})$/i.exec(sigHeader);
	if (sigMatch) {
		const expectedSig = createHmac("sha256", SECRET).update(bodyText).digest("hex");
		if (safeCompare(sigMatch[1].toLowerCase(), expectedSig)) {
			return true;
		}
	}

	return false;
}

function isDeployLocked(): boolean {
	if (!existsSync(LOCK_DIR)) return false;
	const pidFile = resolve(LOCK_DIR, "pid");
	if (!existsSync(pidFile)) return true;
	try {
		const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
		if (Number.isInteger(pid) && pid > 0) {
			process.kill(pid, 0);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

function readDeploymentState(): Record<string, unknown> {
	if (!existsSync(STATE_FILE)) {
		return { status: "idle", locked: isDeployLocked() };
	}
	try {
		const content = readFileSync(STATE_FILE, "utf8");
		const parsed = JSON.parse(content) as Record<string, unknown>;
		return { ...parsed, locked: isDeployLocked() };
	} catch {
		return { status: "unknown", locked: isDeployLocked() };
	}
}

async function executeDeploy(
	tag: string
): Promise<{ success: boolean; code: number; output: string }> {
	console.log(`[daemon] Starting deployment for tag: ${tag}`);
	const proc = Bun.spawn([SCRIPT_PATH, tag], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	const output = `${stdout}\n${stderr}`.trim();

	console.log(`[daemon] Deployment finished with exit code: ${code}`);
	return { success: code === 0, code, output };
}

if (!SECRET) {
	console.warn(
		"[daemon] Warning: DEPLOY_WEBHOOK_SECRET is not configured; all deploy requests will be rejected (503)."
	);
}

const server = Bun.serve({
	hostname: HOST,
	port: PORT,
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		if (
			(req.method === "GET" || req.method === "HEAD") &&
			(path === "/health" || path === "/_deploy/health")
		) {
			if (req.method === "HEAD") {
				return new Response(null, { status: 200 });
			}
			return Response.json({ status: "ok" });
		}

		if (req.method === "GET" && (path === "/status" || path === "/_deploy/status")) {
			const authHeader = req.headers.get("authorization") || "";
			const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
			if (!SECRET || !bearerMatch || !safeCompare(bearerMatch[1], SECRET)) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			return Response.json(readDeploymentState());
		}

		if (
			req.method === "POST" &&
			(path === "/deploy" ||
				path === "/_deploy" ||
				path === "/_deploy/deploy" ||
				path === "/")
		) {
			if (!SECRET) {
				return Response.json(
					{ error: "DEPLOY_WEBHOOK_SECRET is not configured on daemon" },
					{ status: 503 }
				);
			}

			const contentLength = Number.parseInt(req.headers.get("content-length") || "0", 10);
			if (contentLength > MAX_BODY_BYTES) {
				return Response.json({ error: "Request payload too large" }, { status: 413 });
			}

			const bodyText = await req.text();
			if (bodyText.length > MAX_BODY_BYTES) {
				return Response.json({ error: "Request payload too large" }, { status: 413 });
			}

			if (!verifyAuth(req, bodyText)) {
				console.warn("[daemon] Rejected unauthorized deploy request");
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			if (isDeployLocked()) {
				return Response.json({ error: "Deployment already in progress" }, { status: 409 });
			}

			let tag = "latest";
			if (bodyText.trim().length > 0) {
				try {
					const payload = JSON.parse(bodyText);
					if (payload?.tag) {
						if (!TAG_PATTERN.test(payload.tag)) {
							return Response.json({ error: "Invalid tag format" }, { status: 400 });
						}
						tag = payload.tag;
					}
				} catch {
					return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
				}
			}

			// Launch the deployment in the background asynchronously so the HTTP connection
			// completes immediately (returning 202 Accepted) instead of holding an idle socket open
			// for 5-10 minutes while Docker pulls images and starts containers.
			queueMicrotask(() => {
				executeDeploy(tag).catch((err) => {
					console.error("[daemon] Unexpected background deployment failure:", err);
				});
			});

			return Response.json(
				{
					status: "deploying",
					tag,
					startedAt: new Date().toISOString(),
					message: `Deployment initiated for tag: ${tag}`,
				},
				{ status: 202 }
			);
		}

		return Response.json({ error: "Not found" }, { status: 404 });
	},
});

console.log(`[daemon] Listening on http://${server.hostname}:${server.port}`);

const shutdown = () => {
	console.log("[daemon] Shutting down...");
	server.stop(true);
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
