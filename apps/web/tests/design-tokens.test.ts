import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { describeRule, scanDesignTokens } from "../scripts/check-design-tokens";

const SOURCE_ROOT = join(import.meta.dirname, "..", "src");

describe("design tokens", () => {
	test("web sources never bypass the typography and color token scales", () => {
		const violations = scanDesignTokens(SOURCE_ROOT);
		const summary = violations
			.slice(0, 40)
			.map(
				(violation) =>
					`${violation.file}:${violation.line} ${violation.match} [${violation.rule}] ${describeRule(violation.rule)}`
			)
			.join("\n");
		expect(summary).toBe("");
		expect(violations).toHaveLength(0);
	});
});
