import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

/**
 * Guards the web app against typography/color values that bypass the design
 * system in `uno.config.ts` and `lib/theme.ts`.
 *
 * Run directly (`bun scripts/check-design-tokens.ts [path]`) or through
 * `tests/design-tokens.test.ts`, which fails CI on any violation.
 */
export type DesignTokenViolation = {
	rule: string;
	file: string;
	line: number;
	match: string;
};

type Rule = {
	id: string;
	pattern: RegExp;
	description: string;
};

const RULES: readonly Rule[] = [
	{
		id: "raw-font-size",
		pattern: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
		description: "raw Tailwind font size; use a `ts-*` or `text-<token>` typography token",
	},
	{
		id: "arbitrary-font-size",
		pattern: /\btext-\[[^\]]+\]/g,
		description: "arbitrary font size/color; use a typography or color token",
	},
	{
		id: "raw-tracking",
		pattern: /\btracking-(?:tighter|tight|normal|wide|wider|widest)\b/g,
		description: "raw letter spacing; use a `tracking-<token>` token",
	},
	{
		id: "arbitrary-font-family",
		pattern: /\bfont-\[[^\]]+\]/g,
		description: "arbitrary font family; use `font-body` or `font-code`",
	},
	{
		id: "raw-font-mono",
		pattern: /\bfont-mono\b/g,
		description: "raw mono utility; use `font-code` when mono is intentional",
	},
	{
		id: "dead-color-utility",
		pattern:
			/\bcolor-(?:display|display-inverted|primary|secondary|tertiary|quaternary|error|on-error|highlight|on-highlight|surface|surface-inverted|surface-container-high|surface-container-medium|surface-container-low)\b/g,
		description: "`color-*` is not a generated utility; use `text-<token>`",
	},
	{
		id: "raw-black-white",
		pattern: /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:white|black)(?:\/[0-9]+)?\b/g,
		description:
			"raw black/white; use a semantic color token (`bg-scrim`, `text-display`, ...)",
	},
	{
		id: "raw-shadow",
		pattern: /\bshadow-(?:sm|lg|2xl|inner)\b/g,
		description: "raw shadow step; the token scale only defines `shadow-md` and `shadow-xl`",
	},
	{
		id: "raw-hex-color",
		pattern: /#[0-9a-fA-F]{3,8}\b/g,
		description: "hardcoded hex color; declare it in `lib/theme.ts` and use the token",
	},
	{
		id: "raw-rgb-color",
		pattern: /\brgba?\(/g,
		description: "hardcoded rgb color; declare it in `lib/theme.ts` and use the token",
	},
];

const SOURCE_EXTENSIONS = new Set([".tsx", ".astro", ".ts"]);
const IGNORED_PATHS = [
	"lib/theme.ts",
	"lib/theme.test.ts",
	"uno.config.ts",
	"scripts/check-design-tokens.ts",
	"tests/design-tokens.test.ts",
];

function isIgnored(relativePath: string): boolean {
	return IGNORED_PATHS.some(
		(ignored) => relativePath === ignored || relativePath.endsWith(`/${ignored}`)
	);
}

function walk(directory: string, files: string[] = []): string[] {
	if (statSync(directory).isFile()) return [directory];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = join(directory, entry.name);
		if (entry.isDirectory()) {
			walk(absolute, files);
			continue;
		}
		if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(absolute);
	}
	return files;
}

export function scanDesignTokens(rootDirectory: string): DesignTokenViolation[] {
	const root = resolve(rootDirectory);
	const violations: DesignTokenViolation[] = [];
	for (const file of walk(root)) {
		const relativePath = relative(root, file).replaceAll("\\", "/");
		if (isIgnored(relativePath)) continue;
		const lines = readFileSync(file, "utf8").split("\n");
		lines.forEach((line, index) => {
			for (const rule of RULES) {
				rule.pattern.lastIndex = 0;
				const matches = line.matchAll(rule.pattern);
				for (const match of matches) {
					violations.push({
						rule: rule.id,
						file: relativePath,
						line: index + 1,
						match: match[0],
					});
				}
			}
		});
	}
	return violations;
}

export function describeRule(ruleId: string): string {
	return RULES.find((rule) => rule.id === ruleId)?.description ?? ruleId;
}

if (import.meta.main) {
	const target = process.argv[2] ?? join(import.meta.dirname, "..", "src");
	const violations = scanDesignTokens(target);
	if (violations.length === 0) {
		console.log(`No design-token violations in ${target}`);
		process.exit(0);
	}
	const grouped = new Map<string, DesignTokenViolation[]>();
	for (const violation of violations) {
		grouped.set(violation.file, [...(grouped.get(violation.file) ?? []), violation]);
	}
	for (const [file, entries] of grouped) {
		console.log(`\n${file}`);
		for (const entry of entries) {
			console.log(
				`  ${entry.line}: ${entry.match}  [${entry.rule}] ${describeRule(entry.rule)}`
			);
		}
	}
	console.log(`\n${violations.length} design-token violation(s) in ${grouped.size} file(s)`);
	process.exit(1);
}
