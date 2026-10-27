#!/usr/bin/env bun
/**
 * CVSA Deployment Webhook Daemon.
 *
 * Runs locally on the production host behind a reverse proxy (e.g. Caddy).
 * Listens for incoming deploy webhooks from GitHub Actions and triggers
 * `./scripts/deploy.sh` safely.
 *
 * Designed to be managed as a real system daemon via systemd (see cvsa-deploy.service).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";

const PORT = Number.parseInt(process.env.DEPLOY_PORT || "9420", 10);
const HOST = process.env.DEPLOY_HOST || "127.0.0.1";
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET || "";
const SCRIPT_PATH = resolve(import.meta.dir, "deploy.sh");
const TAG_PATTERN = /^[a-zA-Z0-9._-]+$/;

let isDeploying = false;
let lastDeployTime: string | null = null;
let lastDeployStatus: "success" | "failure" | null = null;

function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function verifyAuth(req: Request, bodyText: string): boolean {
	if (!SECRET) return true; // No secret configured, allow (open/internal mode)

	// 1. Bearer Token
	const authHeader = req.headers.get("authorization") || "";
	const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
	if (bearerMatch && safeCompare(bearerMatch[1], SECRET)) {
		return true;
	}

	// 2. HMAC-SHA256 Signature (GitHub Webhook style)
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

async function handleDeploy(
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

	console.log(`[daemon] Deployment finished with code: ${code}`);
	return { success: code === 0, code, output };
}

const server = Bun.serve({
	hostname: HOST,
	port: PORT,
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname.replace(/\/+$/, "") || "/";

		// Healthcheck endpoints
		if (
			req.method === "GET" &&
			(path === "/health" || path === "/_deploy/health" || path === "/")
		) {
			return Response.json({
				status: "ok",
				deploying: isDeploying,
				lastDeployTime,
				lastDeployStatus,
			});
		}

		// Deployment endpoints
		if (
			req.method === "POST" &&
			(path === "/deploy" ||
				path === "/_deploy" ||
				path === "/_deploy/deploy" ||
				path === "/")
		) {
			const bodyText = await req.text();

			if (!verifyAuth(req, bodyText)) {
				console.warn("[daemon] Unauthorized deploy attempt received");
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			if (isDeploying) {
				return Response.json(
					{ error: "A deployment is already in progress" },
					{ status: 409 }
				);
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

			isDeploying = true;
			lastDeployTime = new Date().toISOString();

			try {
				const result = await handleDeploy(tag);
				lastDeployStatus = result.success ? "success" : "failure";
				return Response.json(result, { status: result.success ? 200 : 500 });
			} catch (err) {
				lastDeployStatus = "failure";
				const message = err instanceof Error ? err.message : String(err);
				console.error("[daemon] Unexpected error during deployment:", err);
				return Response.json({ success: false, error: message }, { status: 500 });
			} finally {
				isDeploying = false;
			}
		}

		return Response.json({ error: "Not found" }, { status: 404 });
	},
});

console.log(
	`[daemon] Deployment webhook daemon running on http://${server.hostname}:${server.port}`
);

const shutdown = () => {
	console.log("[daemon] Stopping daemon...");
	server.stop(true);
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
