import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeploymentService } from "../src/deploymentService";
const roots: string[] = [];
afterEach(async () => {
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
