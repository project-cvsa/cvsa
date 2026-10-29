import { describe, expect, test } from "vitest";
import { cn } from "../src/lib/cn";

describe("cn", () => {
	test("keeps the last conflicting token utility", () => {
		expect(cn("text-primary", "text-error")).toBe("text-error");
		expect(cn("text-caption", "text-body")).toBe("text-body");
		expect(cn("font-body", "font-code")).toBe("font-code");
		expect(cn("bg-surface", "bg-primary")).toBe("bg-primary");
		expect(cn("tracking-caption", "tracking-label")).toBe("tracking-label");
	});

	test("does not merge a font size into a text color", () => {
		expect(cn("text-caption", "text-secondary")).toBe("text-caption text-secondary");
		expect(cn("text-heading-2", "text-display")).toBe("text-heading-2 text-display");
	});

	test("resolves component defaults against caller overrides", () => {
		expect(cn("px-3 h-8 text-caption", "px-4")).toBe("h-8 text-caption px-4");
		expect(cn("bg-primary text-display-inverted", "bg-transparent")).toBe(
			"text-display-inverted bg-transparent"
		);
	});

	test("keeps conditional and custom classes", () => {
		expect(cn("flex", false, undefined, null, { "items-center": true })).toBe(
			"flex items-center"
		);
		expect(cn("ts-caption", "ts-label")).toBe("ts-caption ts-label");
	});
});
