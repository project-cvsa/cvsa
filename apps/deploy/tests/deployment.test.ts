import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandError, DeploymentService, dockerLogin } from "../src/deploymentService";
const roots: string[] = [];
const originalGhcrUser = process.env.GHCR_USERNAME;
const originalGhcrToken = process.env.GHCR_PULL_TOKEN;
afterEach(async () => {
	if (originalGhcrUser === undefined) delete process.env.GHCR_USERNAME;
	else process.env.GHCR_USERNAME = originalGhcrUser;
	if (originalGhcrToken === undefined) delete process.env.GHCR_PULL_TOKEN;
	else process.env.GHCR_PULL_TOKEN = originalGhcrToken;
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(fail: boolean) {
	const root = await mkdtemp(join(tmpdir(), "cvsa-deploy-"));
	roots.push(root);
	await Bun.write(join(root, ".env"), "IMAGE_TAG=old\n");
	await Bun.write(
		join(root, "docker-compose.override.yml"),
		"services:\n  crawler:\n    image: old-crawler\n    networks:\n      - custom-net\nnetworks:\n  custom-net:\n    external: true\n"
	);
	const calls: string[][] = [];
	const cleaned: string[][] = [];
	const service = new DeploymentService(
		root,
		async (_files, args) => {
			calls.push(args);
			if (fail && args[0] === "up") throw new Error("unhealthy");
		},
		async (services) => {
			cleaned.push([...services]);
		}
	);
	await service.initialize();
	const state = service.start({ tag: "sha-123456789abc", services: ["web"] });
	expect(service.start({ tag: "sha-123456789abc", services: ["backend"] })).toBeUndefined();
	for (let i = 0; i < 100 && state?.status === "deploying"; i++) await Bun.sleep(5);
	return { root, calls, cleaned, state };
}
test("selective deployment preserves other versions and custom configurations", async () => {
	const { root, calls, state } = await fixture(false);
	expect(state?.status).toBe("success");
	expect(state?.exitCode).toBe(0);
	const rawText = await Bun.file(join(root, "docker-compose.override.yml")).text();
	const config = Bun.YAML.parse(rawText) as {
		services: {
			crawler: { image: string; networks?: string[] };
			web: { image: string };
		};
		networks: { "custom-net": { external: boolean } };
	};
	expect(config.services.crawler.image).toBe("old-crawler");
	expect(config.services.crawler.networks).toEqual(["custom-net"]);
	expect(config.networks["custom-net"].external).toBe(true);
	expect(config.services.web.image).toEndWith(":sha-123456789abc");
	expect(calls[1]).toEqual(["pull", "web"]);
	expect(calls[2]).toContain("--no-deps");
	expect(await Bun.file(join(root, ".env")).text()).toBe("IMAGE_TAG=old\n");
});
test("successful rollout removes stale images for the deployed services", async () => {
	const { cleaned, state } = await fixture(false);
	expect(state?.status).toBe("success");
	expect(cleaned).toEqual([["web"]]);
});
test("unhealthy rollout does not save desired versions as successful", async () => {
	const { root, cleaned, state } = await fixture(true);
	expect(state?.status).toBe("failed");
	expect(state?.exitCode).toBe(1);
	expect(cleaned).toEqual([]);
	expect(await Bun.file(join(root, "docker-compose.override.yml")).text()).toContain(
		"old-crawler"
	);
	expect(await Bun.file(join(root, "docker-compose.override.yml")).text()).not.toContain("web");
});
test("restart marks an interrupted deployment failed", async () => {
	const root = await mkdtemp(join(tmpdir(), "cvsa-restart-"));
	roots.push(root);
	await Bun.write(
		join(root, ".deploy.state.json"),
		JSON.stringify({
			id: "old",
			status: "deploying",
			tag: "sha-123456789abc",
			services: ["web"],
			startedAt: new Date().toISOString(),
			finishedAt: null,
			error: null,
		})
	);
	const service = new DeploymentService(root);
	await service.initialize();
	expect(service.status.status).toBe("failed");
});
test("upgrade tolerates the old shell deployment status file", async () => {
	const root = await mkdtemp(join(tmpdir(), "cvsa-upgrade-"));
	roots.push(root);
	await Bun.write(
		join(root, ".deploy.state.json"),
		JSON.stringify({ status: "success", tag: "latest", exitCode: 0 })
	);
	const service = new DeploymentService(root);
	await service.initialize();
	expect(service.status.status).toBe("idle");
});

test("logs in to ghcr.io before pulling when GHCR credentials are configured", async () => {
	const root = await mkdtemp(join(tmpdir(), "cvsa-ghcr-login-"));
	roots.push(root);
	process.env.GHCR_USERNAME = "octocat";
	process.env.GHCR_PULL_TOKEN = "ghp_test_token";
	const events: string[] = [];
	const service = new DeploymentService(
		root,
		async (_files, args) => {
			events.push(`compose:${args[0]}`);
		},
		async () => {},
		async (registry, username, token) => {
			events.push(`login:${registry}:${username}:${token}`);
		}
	);
	await service.initialize();
	const state = service.start({ tag: "sha-123456789abc", services: ["web"] });
	for (let i = 0; i < 100 && state?.status === "deploying"; i++) await Bun.sleep(5);
	expect(state?.status).toBe("success");
	expect(state?.exitCode).toBe(0);
	expect(events).toEqual([
		"compose:config",
		"login:ghcr.io:octocat:ghp_test_token",
		"compose:pull",
		"compose:up",
	]);
});

test("skips ghcr.io login when GHCR credentials are empty or incomplete", async () => {
	const root = await mkdtemp(join(tmpdir(), "cvsa-ghcr-skip-"));
	roots.push(root);
	process.env.GHCR_USERNAME = "octocat";
	process.env.GHCR_PULL_TOKEN = "   ";
	const logins: string[] = [];
	const service = new DeploymentService(
		root,
		async () => {},
		async () => {},
		async (registry) => {
			logins.push(registry);
		}
	);
	await service.initialize();
	const state = service.start({ tag: "sha-123456789abc", services: ["web"] });
	for (let i = 0; i < 100 && state?.status === "deploying"; i++) await Bun.sleep(5);
	expect(state?.status).toBe("success");
	expect(logins).toEqual([]);
});

test("dockerLogin pipes token on stdin and redacts token on failure", async () => {
	const binDir = await mkdtemp(join(tmpdir(), "cvsa-docker-bin-"));
	roots.push(binDir);
	const argsLog = join(binDir, "args.txt");
	const stdinLog = join(binDir, "stdin.txt");
	const dockerPath = join(binDir, "docker");
	await Bun.write(
		dockerPath,
		`#!/bin/sh
printf '%s\n' "$*" > "${argsLog}"
cat > "${stdinLog}"
if grep -q "bad-token" "${stdinLog}"; then
  echo "denied for bad-token" >&2
  exit 17
fi
echo "Login Succeeded"
`
	);
	await chmod(dockerPath, 0o755);

	await dockerLogin("ghcr.io", "octocat", "good-token", dockerPath);
	expect((await Bun.file(argsLog).text()).trim()).toBe(
		"login ghcr.io -u octocat --password-stdin"
	);
	expect((await Bun.file(stdinLog).text()).trim()).toBe("good-token");

	let caught: unknown;
	try {
		await dockerLogin("ghcr.io", "octocat", "bad-token", dockerPath);
	} catch (error) {
		caught = error;
	}
	if (!(caught instanceof CommandError)) {
		throw new Error(`Expected CommandError, got ${String(caught)}`);
	}
	expect(caught.exitCode).toBe(17);
	expect(caught.message).not.toContain("bad-token");
	expect(caught.message).toContain("exit 17");
});

test("captures compose stderr and exitCode on pull failure", async () => {
	const root = await mkdtemp(join(tmpdir(), "cvsa-compose-fail-"));
	const binDir = await mkdtemp(join(tmpdir(), "cvsa-compose-bin-"));
	roots.push(root, binDir);
	delete process.env.GHCR_USERNAME;
	delete process.env.GHCR_PULL_TOKEN;

	const dockerPath = join(binDir, "docker");
	await Bun.write(
		dockerPath,
		`#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "pull" ]; then
    echo "pulling web..."
    echo "unauthorized: authentication required" >&2
    exit 18
  fi
done
exit 0
`
	);
	await chmod(dockerPath, 0o755);

	const service = new DeploymentService(root, undefined, async () => {}, undefined, dockerPath);
	await service.initialize();
	const state = service.start({ tag: "sha-123456789abc", services: ["web"] });
	for (let i = 0; i < 100 && state?.status === "deploying"; i++) await Bun.sleep(5);
	expect(state?.status).toBe("failed");
	expect(state?.exitCode).toBe(18);
	expect(state?.error).toContain("docker compose pull failed (exit 18)");
	expect(state?.error).toContain("unauthorized: authentication required");
});
