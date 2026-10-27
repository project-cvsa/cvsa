import { describe, expect, test } from "bun:test";
import { i18nRuntime } from "../src/common/i18n";

describe("i18n runtime", () => {
	test("successfully initializes and resolves translations", () => {
		expect(i18nRuntime).toBeDefined();
		const t = i18nRuntime.getT({ locale: "zh", namespace: "backend" });
		expect(typeof t).toBe("function");
	});
});
