import { expect, test } from "bun:test";
import { planReleaseTargets } from "../src/plan";

test("respects manual service selection", async () => {
	const single = await planReleaseTargets({ selection: "web" });
	expect(single).toEqual(["web"]);

	const all = await planReleaseTargets({ selection: "all" });
	expect(all).toEqual(["backend", "crawler", "embedding", "web"]);

	expect(planReleaseTargets({ selection: "invalid-svc" })).rejects.toThrow(
		'Invalid release service: "invalid-svc"'
	);
});

test("fails closed if git diff command fails", async () => {
	const failingDiff = async () => {
		throw new Error("fatal: ambiguous argument 'HEAD^'");
	};
	expect(
		planReleaseTargets({
			selection: "affected",
			gitDiffRunner: failingDiff,
		})
	).rejects.toThrow("fatal: ambiguous argument");
});

test("returns empty array for pure non-code changes", async () => {
	const nonCodeDiff = async () => [
		"README.md",
		"apps/docs/content/index.md",
		"apps/docs/package.json",
		"packages/db/README.md",
		".vscode/settings.json",
		".github/ISSUE_TEMPLATE/task.yml",
		".github/workflows/build-docs.yml",
		"LICENSE",
	];
	const result = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: nonCodeDiff,
	});
	expect(result).toEqual([]);
});

test("triggers all services when root infrastructure files change", async () => {
	const dockerfileDiff = async () => ["Dockerfile"];
	const dockerfileResult = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: dockerfileDiff,
	});
	expect(dockerfileResult).toEqual(["backend", "crawler", "embedding", "web"]);

	const composeDiff = async () => ["docker-compose.yml"];
	const composeResult = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: composeDiff,
	});
	expect(composeResult).toEqual(["backend", "crawler", "embedding", "web"]);

	const lockfileDiff = async () => ["bun.lock"];
	const lockfileResult = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: lockfileDiff,
	});
	expect(lockfileResult).toEqual(["backend", "crawler", "embedding", "web"]);

	const dockerignoreDiff = async () => [".dockerignore"];
	const dockerignoreResult = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: dockerignoreDiff,
	});
	expect(dockerignoreResult).toEqual(["backend", "crawler", "embedding", "web"]);
});

test("triggers all services when global locale assets change", async () => {
	const localeDiff = async () => ["locale/modules/backend/messages/zh.json"];
	const result = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: localeDiff,
	});
	expect(result).toEqual(["backend", "crawler", "embedding", "web"]);
});

test("filters by turbo affected packages for workspace-scoped changes", async () => {
	const webDiff = async () => ["apps/web/src/pages/index.astro"];
	const turboRunner = async () => ["@cvsa/web"];
	const result = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: webDiff,
		turboAffectedRunner: turboRunner,
	});
	expect(result).toEqual(["web"]);
});

test("propagates type-only contract edges from crawler to backend and web", async () => {
	const crawlerDiff = async () => ["apps/crawler/src/controlPlane/index.ts"];
	const turboRunner = async () => ["@cvsa/crawler"];
	const result = await planReleaseTargets({
		selection: "affected",
		gitDiffRunner: crawlerDiff,
		turboAffectedRunner: turboRunner,
	});
	expect(result).toEqual(["backend", "crawler", "web"]);
});
