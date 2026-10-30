import { appendFile } from "node:fs/promises";
import { z } from "zod";

export const SUPPORTED_SERVICES = ["backend", "crawler", "embedding", "web"] as const;
export type SupportedService = (typeof SUPPORTED_SERVICES)[number];

export const NON_CODE_PATTERNS: readonly RegExp[] = [
	/^README(\..+)?\.md$/i,
	/\.md$/i,
	/^LICENSE$/i,
	/^apps\/docs\//,
	/^\.github\/ISSUE_TEMPLATE\//,
	/^\.github\/workflows\/build-docs\.yml/,
	/^\.(vscode|idea|zed|gemini|trae|opencode)\//,
	/\.DS_Store$/,
];

export function isNonCodeFile(path: string): boolean {
	return NON_CODE_PATTERNS.some((pattern) => pattern.test(path));
}

export function isGlobalImpactFile(path: string): boolean {
	if (path.startsWith("locale/")) return true;
	if (!path.startsWith("apps/") && !path.startsWith("packages/")) return true;
	return false;
}

export interface PlanOptions {
	selection?: string;
	base?: string;
	head?: string;
	gitDiffRunner?: (base: string, head: string) => Promise<string[]>;
	turboAffectedRunner?: (base: string, head: string) => Promise<string[]>;
}

export async function defaultGitDiff(base: string, head: string): Promise<string[]> {
	const proc = Bun.spawn(["git", "diff", "--name-only", base, head], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(
			`git diff --name-only ${base} ${head} failed (exit ${code}): ${stderr.trim()}`
		);
	}
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export async function defaultTurboAffected(base: string, head: string): Promise<string[]> {
	const proc = Bun.spawn(
		[
			"bunx",
			"--bun",
			"turbo",
			"ls",
			"--affected",
			`--filter=...[${base}...${head}]`,
			"--output",
			"json",
		],
		{
			stdout: "pipe",
			stderr: "pipe",
		}
	);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`turbo ls --affected failed (exit ${code}): ${stderr.trim()}`);
	}
	const result = z
		.object({
			packages: z.object({
				items: z.array(z.object({ name: z.string() })),
			}),
		})
		.parse(JSON.parse(stdout));
	return result.packages.items.map((item) => item.name);
}

export async function planReleaseTargets(options: PlanOptions = {}): Promise<SupportedService[]> {
	const selection = options.selection ?? process.env.RELEASE_SERVICE ?? "affected";
	const allServices = [...SUPPORTED_SERVICES];

	if (selection !== "affected") {
		if (selection === "all") return allServices;
		const target = allServices.find((s) => s === selection);
		if (!target) throw new Error(`Invalid release service: "${selection}"`);
		return [target];
	}

	const rawBase = options.base ?? process.env.TURBO_SCM_BASE;
	const base = !rawBase || /^0+$/.test(rawBase) ? "HEAD^" : rawBase;
	const head = options.head ?? process.env.TURBO_SCM_HEAD ?? "HEAD";

	const gitDiff = options.gitDiffRunner ?? defaultGitDiff;
	const turboAffected = options.turboAffectedRunner ?? defaultTurboAffected;

	const changedFiles = await gitDiff(base, head);

	if (changedFiles.length === 0) {
		return [];
	}

	const hasFunctionalChanges = changedFiles.some((file) => !isNonCodeFile(file));
	if (!hasFunctionalChanges) {
		return [];
	}

	const hasGlobalImpact = changedFiles.some(
		(file) => !isNonCodeFile(file) && isGlobalImpactFile(file)
	);
	if (hasGlobalImpact) {
		return allServices;
	}

	const affectedPackageNames = await turboAffected(base, head);
	const affected = new Set(affectedPackageNames);

	if (affected.has("@cvsa/crawler")) affected.add("@cvsa/backend");
	if (affected.has("@cvsa/backend")) affected.add("@cvsa/web");

	return allServices.filter((service) => affected.has(`@cvsa/${service}`));
}

if (import.meta.main) {
	const targets = await planReleaseTargets();
	const tag = `sha-${(process.env.GITHUB_SHA ?? "").slice(0, 12)}`;
	await appendFile(
		process.env.GITHUB_OUTPUT ?? "/dev/stdout",
		`services=${JSON.stringify(targets)}\ntag=${tag}\n`
	);
}
