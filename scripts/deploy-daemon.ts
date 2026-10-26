#!/usr/bin/env bun
/**
 * CVSA deploy webhook daemon.
 *
 * Runs directly on the host next to the production compose stack:
 *
 *   DEPLOY_WEBHOOK_SECRET=<hex> bun run scripts/deploy-daemon.ts
 *
 * It deliberately has no external dependencies (Bun.serve + Bun.spawn + Node
 * builtins only), so it never needs `bun install` on the deployment host.
 *
 * Flow per `POST /deploy`:
 *   1. (optional) refresh the deployment artifacts from `origin/main`
 *   2. pin `IMAGE_TAG` in `.env.prod`
 *   3. `docker login ghcr.io` when pull credentials are configured
 *   4. pull the four application images
 *   5. drain the crawler (single dispatcher, no overlapping generations)
 *   6. apply `@cvsa/db` and `@cvsa/snapshot-db` migrations
 *   7. `docker compose up -d --wait` against the native healthchecks
 *   8. roll `IMAGE_TAG` back and re-`up` when 6 or 7 fails
 *
 * Caddy exposes it at `https://<SITE_ADDRESS>/_deploy/...`, so the daemon can
 * stay bound to `127.0.0.1` and no extra firewall port is opened.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_PORT = 9420;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_COMPOSE_FILE = "docker-compose.prod.yml";
const DEFAULT_ENV_FILE = ".env.prod";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_OUTPUT_CHARS = 8_000;
const HEALTH_PATHS = new Set(["/health", "/_deploy/health"]);
const DEPLOY_PATHS = new Set(["/deploy", "/_deploy", "/_deploy/deploy"]);
const TAG_PATTERN = /^[a-zA-Z0-9._-]+$/;

type LogLevel = "debug" | "info" | "warn" | "error";

type DaemonConfig = {
	host: string;
	port: number;
	secret: string;
	workdir: string;
	composeFile: string;
	envFile: string;
};

type StepStatus = "ok" | "skipped" | "warning" | "failed";

type StepRecord = {
	id: string;
	title: string;
	status: StepStatus;
	exitCode: number | null;
	durationMs: number;
	output: string;
};

type StepResult = {
	status: StepStatus;
	exitCode?: number | null;
	output?: string;
	detail?: string;
};

type CommandResult = {
	code: number;
	timedOut: boolean;
	output: string;
	durationMs: number;
};

type CommandOptions = {
	cwd: string;
	timeoutMs?: number;
	stdin?: string;
	env?: Record<string, string | undefined>;
};

type DeployRequest = {
	tag: string;
	syncGit: boolean;
};

type DaemonState = {
	deploying: boolean;
	currentTag: string;
	lastDeployId: string | null;
};

type DeployOutcome = {
	ok: boolean;
	tag: string;
	previousTag: string | null;
	rolledBack: boolean;
	steps: StepRecord[];
	error: string | null;
	durationMs: number;
};

// -----------------------------------------------------------------------------
// Structured logging
// -----------------------------------------------------------------------------

function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
	const entry = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
	const write = level === "error" || level === "warn" ? console.error : console.log;
	write(entry);
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

function parseDotEnv(content: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) continue;
		const separator = line.indexOf("=");
		if (separator <= 0) continue;
		const key = line.slice(0, separator).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
		let value = line.slice(separator + 1).trim();
		const quoted =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"));
		if (quoted && value.length >= 2) value = value.slice(1, -1);
		values[key] = value;
	}
	return values;
}

/**
 * Loads `.env.prod` without overriding variables the operator exported in the
 * process environment, so `DEPLOY_WEBHOOK_SECRET=... bun run ...` always wins.
 */
const loadedEnvironmentFiles = new Set<string>();

function loadEnvironmentFile(path: string): void {
	const absolutePath = resolve(path);
	if (loadedEnvironmentFiles.has(absolutePath)) return;
	if (!existsSync(absolutePath)) return;
	loadedEnvironmentFiles.add(absolutePath);
	let content: string;
	try {
		content = readFileSync(absolutePath, "utf8");
	} catch (error) {
		log("warn", "Could not read environment file", {
			path: absolutePath,
			error: describeError(error),
		});
		return;
	}
	const values = parseDotEnv(content);
	for (const [key, value] of Object.entries(values)) {
		if (process.env[key] === undefined) process.env[key] = value;
	}
	log("debug", "Loaded environment file", {
		path: absolutePath,
		keys: Object.keys(values).length,
	});
}

function parsePort(raw: string | undefined): number {
	if (raw === undefined || raw.trim().length === 0) return DEFAULT_PORT;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
		throw new Error(`DEPLOY_PORT must be an integer from 1 to 65535 (received "${raw}")`);
	}
	return parsed;
}

function resolveWorkdir(): string {
	const workdirValue = process.env.DEPLOY_WORKDIR?.trim();
	return workdirValue && workdirValue.length > 0 ? resolve(workdirValue) : process.cwd();
}

function resolveConfig(): DaemonConfig {
	const workdir = resolveWorkdir();
	return {
		host: process.env.DEPLOY_HOST?.trim() || DEFAULT_HOST,
		port: parsePort(process.env.DEPLOY_PORT),
		secret: process.env.DEPLOY_WEBHOOK_SECRET?.trim() ?? "",
		workdir,
		composeFile: process.env.DEPLOY_COMPOSE_FILE?.trim() || DEFAULT_COMPOSE_FILE,
		envFile: process.env.DEPLOY_ENV_FILE?.trim() || DEFAULT_ENV_FILE,
	};
}

// -----------------------------------------------------------------------------
// Environment file editing (IMAGE_TAG pinning / rollback)
// -----------------------------------------------------------------------------

function readImageTag(content: string): string | null {
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (!line.startsWith("IMAGE_TAG=")) continue;
		const value = line.slice("IMAGE_TAG=".length).trim();
		return value.length > 0 ? value : null;
	}
	return null;
}

function withImageTag(content: string, tag: string): string {
	const lines = content.split("\n");
	const index = lines.findIndex((line) => line.trimStart().startsWith("IMAGE_TAG="));
	if (index >= 0) {
		lines[index] = `IMAGE_TAG=${tag}`;
		return lines.join("\n");
	}
	const separator = content.endsWith("\n") || content.length === 0 ? "" : "\n";
	return `${content}${separator}IMAGE_TAG=${tag}\n`;
}

async function readEnvFile(envPath: string): Promise<string> {
	return await readFile(envPath, "utf8");
}

async function writeEnvFile(envPath: string, content: string): Promise<void> {
	const temporaryPath = `${envPath}.deploy-${randomUUID()}.tmp`;
	await Bun.write(temporaryPath, content);
	await rename(temporaryPath, envPath);
}

// -----------------------------------------------------------------------------
// Process execution
// -----------------------------------------------------------------------------

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

async function runCommand(argv: string[], options: CommandOptions): Promise<CommandResult> {
	const startedAt = Date.now();
	const proc = Bun.spawn(argv, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});

	// Manual timeout: Bun's `killed` flag is not a reliable "was it the timeout"
	// signal, and every deploy step must report an honest reason for failing.
	let timedOut = false;
	const timer =
		options.timeoutMs === undefined
			? null
			: setTimeout(() => {
					timedOut = true;
					proc.kill("SIGTERM");
				}, options.timeoutMs);

	proc.stdin.write(options.stdin ?? "");
	await proc.stdin.end();

	let output = "";
	const append = (text: string): void => {
		output += text;
		if (output.length > MAX_OUTPUT_CHARS)
			output = output.slice(output.length - MAX_OUTPUT_CHARS);
	};

	const pump = async (stream: ReadableStream<Uint8Array> | undefined): Promise<void> => {
		if (!stream) return;
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let pending = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			pending += decoder.decode(value, { stream: true });
			const lines = pending.split("\n");
			pending = lines.pop() ?? "";
			for (const line of lines) {
				if (line.trim().length === 0) continue;
				append(`${line}\n`);
				log("debug", "command output", { command: argv.join(" "), line });
			}
		}
		if (pending.trim().length > 0) append(`${pending}\n`);
	};

	await Promise.all([pump(proc.stdout), pump(proc.stderr)]);
	const code = await proc.exited;
	if (timer !== null) clearTimeout(timer);
	const durationMs = Date.now() - startedAt;

	if (timedOut) {
		append(`\nCommand exceeded ${options.timeoutMs}ms and was terminated.\n`);
	}

	log("debug", "Command finished", {
		command: argv.join(" "),
		code,
		durationMs,
		timedOut,
	});

	return { code, timedOut, output: output.trimEnd(), durationMs };
}

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------

function constantTimeEquals(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left, "utf8");
	const rightBuffer = Buffer.from(right, "utf8");
	if (leftBuffer.length !== rightBuffer.length) return false;
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyBearer(header: string | null, secret: string): boolean {
	if (!header) return false;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	if (!match) return false;
	return constantTimeEquals(match[1], secret);
}

function verifySignature(header: string | null, secret: string, body: string): boolean {
	if (!header) return false;
	const match = /^sha256=([a-f0-9]{64})$/i.exec(header.trim());
	if (!match) return false;
	const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
	return constantTimeEquals(expected, match[1].toLowerCase());
}

function isAuthorized(request: Request, secret: string, body: string): boolean {
	return (
		verifyBearer(request.headers.get("authorization"), secret) ||
		verifySignature(request.headers.get("x-hub-signature-256"), secret, body)
	);
}

// -----------------------------------------------------------------------------
// Deployment
// -----------------------------------------------------------------------------

async function runStep(
	steps: StepRecord[],
	id: string,
	title: string,
	action: () => Promise<StepResult>
): Promise<StepResult> {
	const startedAt = Date.now();
	let result: StepResult;
	try {
		result = await action();
	} catch (error) {
		result = { status: "failed", output: describeError(error) };
	}
	const record: StepRecord = {
		id,
		title,
		status: result.status,
		exitCode: result.exitCode ?? null,
		durationMs: Date.now() - startedAt,
		output: result.output ?? result.detail ?? "",
	};
	steps.push(record);
	log(result.status === "failed" ? "error" : "info", `Step ${id} ${result.status}`, {
		title,
		durationMs: record.durationMs,
		exitCode: record.exitCode,
		detail: result.detail,
	});
	return result;
}

function composeArgs(config: DaemonConfig, args: string[]): string[] {
	return ["docker", "compose", "--env-file", config.envFile, "-f", config.composeFile, ...args];
}

async function performDeploy(
	request: DeployRequest,
	config: DaemonConfig,
	deployId: string
): Promise<DeployOutcome> {
	const startedAt = Date.now();
	const steps: StepRecord[] = [];
	const envPath = resolve(config.workdir, config.envFile);
	let previousTag: string | null = null;
	let rolledBack = false;
	let error: string | null = null;

	const compose = (args: string[], timeoutMs?: number): Promise<CommandResult> =>
		runCommand(composeArgs(config, args), { cwd: config.workdir, timeoutMs });

	log("info", "Deploy started", { deployId, tag: request.tag, syncGit: request.syncGit });

	// 1. Refresh deployment artifacts from the released branch.
	await runStep(
		steps,
		"sync-git",
		"Refresh compose, Caddyfile and daemon from origin/main",
		() => {
			if (!request.syncGit) {
				return Promise.resolve({
					status: "skipped",
					detail: "syncGit disabled by request",
				});
			}
			if (!existsSync(join(config.workdir, ".git"))) {
				return Promise.resolve({
					status: "skipped",
					detail: "workdir is not a git checkout",
				});
			}

			return (async (): Promise<StepResult> => {
				const artifacts = [
					"docker-compose.prod.yml",
					"docker/Caddyfile",
					"scripts/deploy-daemon.ts",
				];
				const fetch = await runCommand(["git", "fetch", "origin", "main"], {
					cwd: config.workdir,
					timeoutMs: 120_000,
				});
				if (fetch.code !== 0) {
					return {
						status: "failed",
						exitCode: fetch.code,
						output: fetch.output,
						detail: "git fetch origin main failed",
					};
				}
				const checkout = await runCommand(
					["git", "checkout", "FETCH_HEAD", "--", ...artifacts],
					{ cwd: config.workdir, timeoutMs: 60_000 }
				);
				return {
					status: checkout.code === 0 ? "ok" : "failed",
					exitCode: checkout.code,
					output: checkout.output,
					detail:
						checkout.code === 0
							? `Checked out ${artifacts.join(", ")} from FETCH_HEAD`
							: "git checkout FETCH_HEAD failed",
				};
			})();
		}
	);

	// 2. Pin the new image tag before anything is pulled.
	const envStep = await runStep(steps, "pin-image-tag", "Pin IMAGE_TAG in env file", () => {
		return (async (): Promise<StepResult> => {
			let content: string;
			try {
				content = await readEnvFile(envPath);
			} catch (readError) {
				return {
					status: "failed",
					detail: `Cannot read ${envPath}: ${describeError(readError)}. Copy .env.prod.example to .env.prod on the host first.`,
				};
			}
			previousTag = readImageTag(content);
			await writeEnvFile(envPath, withImageTag(content, request.tag));
			return {
				status: "ok",
				detail: `IMAGE_TAG ${previousTag ?? "(unset)"} -> ${request.tag}`,
			};
		})();
	});
	if (envStep.status === "failed") {
		return {
			ok: false,
			tag: request.tag,
			previousTag,
			rolledBack,
			steps,
			error: envStep.detail ?? "Could not update the env file",
			durationMs: Date.now() - startedAt,
		};
	}

	// 3. Registry credentials, only when the host is configured with them.
	await runStep(steps, "registry-login", "docker login ghcr.io", () => {
		const username = process.env.GHCR_USERNAME?.trim() ?? "";
		const token = process.env.GHCR_PULL_TOKEN?.trim() ?? "";
		if (username.length === 0 || token.length === 0) {
			return Promise.resolve({
				status: "skipped",
				detail: "GHCR_USERNAME/GHCR_PULL_TOKEN not configured",
			});
		}
		return (async (): Promise<StepResult> => {
			const result = await runCommand(
				["docker", "login", "ghcr.io", "--username", username, "--password-stdin"],
				{ cwd: config.workdir, stdin: `${token}\n`, timeoutMs: 60_000 }
			);
			return {
				status: result.code === 0 ? "ok" : "failed",
				exitCode: result.code,
				output: result.output,
				detail: result.code === 0 ? `Logged in as ${username}` : "docker login failed",
			};
		})();
	});

	// 4. Pull the application images.
	const pull = await runStep(
		steps,
		"pull-images",
		"Pull backend, crawler, embedding and web",
		() => {
			return (async (): Promise<StepResult> => {
				const result = await compose(
					["pull", "backend", "crawler", "embedding", "web"],
					900_000
				);
				return {
					status: result.code === 0 ? "ok" : "failed",
					exitCode: result.code,
					output: result.output,
					detail: result.timedOut ? "docker compose pull timed out" : undefined,
				};
			})();
		}
	);
	if (pull.status === "failed") {
		// The previously running stack was never touched: restore the old tag so
		// a later `up` cannot pick up the half-pinned value.
		await restoreTag(envPath, previousTag);
		return {
			ok: false,
			tag: request.tag,
			previousTag,
			rolledBack: false,
			steps,
			error: "Image pull failed; the running stack was left untouched",
			durationMs: Date.now() - startedAt,
		};
	}

	// 5. Drain the crawler: it is the only dispatcher, so two generations must
	// never overlap during a rollout. A missing crawler is not an error.
	await runStep(steps, "drain-crawler", "Drain the crawler", () => {
		return (async (): Promise<StepResult> => {
			const stop = await compose(["stop", "-t", "30", "crawler"], 120_000);
			const remove = await compose(["rm", "-f", "crawler"], 60_000);
			const output = [stop.output, remove.output]
				.filter((part) => part.length > 0)
				.join("\n");
			const drained = stop.code === 0 && remove.code === 0;
			return {
				status: drained ? "ok" : "warning",
				exitCode: drained ? 0 : stop.code,
				output,
				detail: drained ? "Crawler stopped and removed" : "Crawler was not running",
			};
		})();
	});

	// 6. Apply both migration sets. `-T` keeps stdout non-interactive, and
	// `--no-deps` avoids starting the whole stack before the migrations run.
	const migrate = await runStep(steps, "migrate", "Apply database migrations", () => {
		return (async (): Promise<StepResult> => {
			const coreMigration = await compose(
				[
					"run",
					"--rm",
					"--no-deps",
					"-T",
					"backend",
					"bun",
					"run",
					"--filter",
					"@cvsa/db",
					"migrate:deploy",
				],
				300_000
			);
			if (coreMigration.code !== 0) {
				return {
					status: "failed",
					exitCode: coreMigration.code,
					output: coreMigration.output,
					detail: "@cvsa/db migrate:deploy failed",
				};
			}
			const snapshotMigration = await compose(
				[
					"run",
					"--rm",
					"--no-deps",
					"-T",
					"crawler",
					"bun",
					"run",
					"--filter",
					"@cvsa/snapshot-db",
					"migrate:deploy",
				],
				300_000
			);
			return {
				status: snapshotMigration.code === 0 ? "ok" : "failed",
				exitCode: snapshotMigration.code,
				output: [coreMigration.output, snapshotMigration.output]
					.filter((part) => part.length > 0)
					.join("\n"),
				detail:
					snapshotMigration.code === 0
						? "Both migration sets applied"
						: "@cvsa/snapshot-db migrate:deploy failed",
			};
		})();
	});

	// 7. Start the stack and block on the native healthchecks (every service in
	// `docker-compose.prod.yml` ships one, Meilisearch included).
	const up = await runStep(steps, "up", "docker compose up --wait", () => {
		if (migrate.status !== "ok") {
			return Promise.resolve({
				status: "skipped",
				detail: "Skipped because migrations failed",
			});
		}
		return (async (): Promise<StepResult> => {
			const result = await compose(
				["up", "-d", "--wait", "--wait-timeout", "120", "--remove-orphans"],
				240_000
			);
			return {
				status: result.code === 0 ? "ok" : "failed",
				exitCode: result.code,
				output: result.output,
				detail: result.timedOut ? "docker compose up --wait timed out" : undefined,
			};
		})();
	});

	if (migrate.status !== "ok" || up.status !== "ok") {
		error =
			migrate.status !== "ok"
				? (migrate.detail ?? "Database migration failed")
				: "Stack did not become healthy after the rollout";
		rolledBack = await rollback({
			envPath,
			previousTag,
			steps,
			compose,
		});
	}

	const outcome: DeployOutcome = {
		ok: error === null,
		tag: request.tag,
		previousTag,
		rolledBack,
		steps,
		error,
		durationMs: Date.now() - startedAt,
	};
	log(error === null ? "info" : "error", error === null ? "Deploy finished" : "Deploy failed", {
		deployId,
		tag: request.tag,
		previousTag,
		rolledBack,
		durationMs: outcome.durationMs,
	});
	return outcome;
}

async function restoreTag(envPath: string, tag: string | null): Promise<void> {
	if (tag === null) return;
	try {
		await writeEnvFile(envPath, withImageTag(await readEnvFile(envPath), tag));
	} catch (error) {
		log("error", "Could not restore IMAGE_TAG", { envPath, tag, error: describeError(error) });
	}
}

async function rollback(input: {
	envPath: string;
	previousTag: string | null;
	steps: StepRecord[];
	compose: (args: string[], timeoutMs?: number) => Promise<CommandResult>;
}): Promise<boolean> {
	const { envPath, previousTag, steps, compose } = input;
	log("warn", "Rolling back", { previousTag });

	const result = await runStep(steps, "rollback", "Roll back to the previous image tag", () => {
		return (async (): Promise<StepResult> => {
			await restoreTag(envPath, previousTag);
			const stop = await compose(["stop", "-t", "30", "crawler"], 120_000);
			const up = await compose(
				["up", "-d", "--wait", "--wait-timeout", "120", "--remove-orphans"],
				240_000
			);
			const output = [stop.output, up.output].filter((part) => part.length > 0).join("\n");
			return {
				status: up.code === 0 ? "ok" : "failed",
				exitCode: up.code,
				output,
				detail:
					up.code === 0
						? `Rolled back to ${previousTag ?? "the previously running images"}`
						: "Rollback did not become healthy either; manual intervention required",
			};
		})();
	});

	return result.status === "ok";
}

// -----------------------------------------------------------------------------
// HTTP layer
// -----------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

async function readBody(request: Request): Promise<{ ok: true; body: string } | { ok: false }> {
	const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return { ok: false };
	const body = await request.text();
	if (body.length > MAX_BODY_BYTES) return { ok: false };
	return { ok: true, body };
}

function parseDeployRequest(body: string): DeployRequest | string {
	if (body.trim().length === 0) return "Request body is required";
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return "Request body must be valid JSON";
	}
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		return "Request body must be a JSON object";
	}
	const tag = Reflect.get(payload, "tag");
	if (typeof tag !== "string" || !TAG_PATTERN.test(tag)) {
		return "`tag` must match /^[a-zA-Z0-9._-]+$/";
	}
	const syncGitValue = Reflect.get(payload, "syncGit");
	if (syncGitValue !== undefined && typeof syncGitValue !== "boolean") {
		return "`syncGit` must be a boolean";
	}
	return { tag, syncGit: syncGitValue !== false };
}

async function handleRequest(
	request: Request,
	config: DaemonConfig,
	state: DaemonState
): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/+$/, "") || "/";

	if (request.method === "GET" && HEALTH_PATHS.has(path)) {
		return jsonResponse(200, {
			status: "ok",
			deploying: state.deploying,
			currentTag: state.currentTag,
			lastDeployId: state.lastDeployId,
		});
	}

	if (DEPLOY_PATHS.has(path)) {
		if (request.method !== "POST") {
			return jsonResponse(405, { error: "Method not allowed; use POST" });
		}
		if (config.secret.length === 0) {
			return jsonResponse(503, {
				error: "DEPLOY_WEBHOOK_SECRET is not configured on the daemon",
			});
		}
		if (state.deploying) {
			return jsonResponse(409, { error: "A deploy is already in progress" });
		}

		const body = await readBody(request);
		if (!body.ok) {
			return jsonResponse(413, { error: `Request body exceeds ${MAX_BODY_BYTES} bytes` });
		}
		if (!isAuthorized(request, config.secret, body.body)) {
			log("warn", "Rejected unauthorised deploy request", {
				remote: request.headers.get("x-forwarded-for") ?? "unknown",
			});
			return jsonResponse(401, {
				error: "Unauthorised: send a Bearer token or a valid X-Hub-Signature-256",
			});
		}

		const parsed = parseDeployRequest(body.body);
		if (typeof parsed === "string") return jsonResponse(400, { error: parsed });

		const deployId = randomUUID();
		state.deploying = true;
		state.lastDeployId = deployId;
		try {
			const outcome = await performDeploy(parsed, config, deployId);
			if (outcome.ok) {
				state.currentTag = parsed.tag;
				return jsonResponse(200, outcome);
			}
			state.currentTag = await readCurrentTag(config);
			return jsonResponse(500, outcome);
		} finally {
			state.deploying = false;
		}
	}

	return jsonResponse(404, { error: "Not found" });
}

async function readCurrentTag(config: DaemonConfig): Promise<string> {
	try {
		const content = await readEnvFile(resolve(config.workdir, config.envFile));
		return readImageTag(content) ?? "unknown";
	} catch (error) {
		log("debug", "Could not read current tag", { error: describeError(error) });
		return "unknown";
	}
}

async function main(): Promise<void> {
	// Two-phase bootstrap: the cwd file may only carry `DEPLOY_WORKDIR`/
	// `DEPLOY_ENV_FILE`, so the real deployment file is loaded afterwards and the
	// config is resolved exactly once, from the fully populated environment.
	loadEnvironmentFile(join(process.cwd(), DEFAULT_ENV_FILE));
	const envFileName = process.env.DEPLOY_ENV_FILE?.trim() || DEFAULT_ENV_FILE;
	loadEnvironmentFile(join(resolveWorkdir(), envFileName));

	const config = resolveConfig();

	const state: DaemonState = {
		deploying: false,
		currentTag: await readCurrentTag(config),
		lastDeployId: null,
	};

	if (config.secret.length === 0) {
		log("warn", "DEPLOY_WEBHOOK_SECRET is unset: every deploy request will be refused", {
			health: "/health",
		});
	}

	const server = Bun.serve({
		hostname: config.host,
		port: config.port,
		async fetch(request: Request): Promise<Response> {
			try {
				return await handleRequest(request, config, state);
			} catch (error) {
				log("error", "Unhandled request error", { error: describeError(error) });
				return jsonResponse(500, { error: "Internal daemon error" });
			}
		},
	});

	log("info", "Deploy daemon listening", {
		url: `http://${server.hostname}:${server.port}`,
		workdir: config.workdir,
		composeFile: config.composeFile,
		envFile: config.envFile,
		currentTag: state.currentTag,
		webhookSecret: config.secret.length > 0 ? "configured" : "missing",
	});

	const shutdown = (signal: string): void => {
		log("info", "Shutting down", { signal });
		server.stop(true);
		process.exit(0);
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}

await main();
