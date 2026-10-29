import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Token-aware class merge.
 *
 * `tailwind-merge` only knows the stock Tailwind scales, so the design-system
 * font sizes, colors, tracking steps and font families are registered here.
 * Without this, `cn("text-caption", "text-primary")` would treat both as
 * text-color utilities and silently drop one of them.
 */
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-family": [{ font: ["body", "code"] }],
			"font-size": [
				{
					text: [
						"caption",
						"label",
						"body",
						"subhead",
						"heading-1",
						"heading-2",
						"heading-3",
						"display-medium",
						"display-large",
						"overline",
					],
				},
			],
			"text-color": [
				{
					text: [
						"display",
						"display-inverted",
						"primary",
						"secondary",
						"tertiary",
						"quaternary",
						"error",
						"on-error",
						"highlight",
						"on-highlight",
						"surface",
						"surface-inverted",
						"surface-container-high",
						"surface-container-medium",
						"surface-container-low",
					],
				},
			],
			tracking: [
				{
					tracking: [
						"caption",
						"label",
						"body",
						"subhead",
						"heading-1",
						"heading-2",
						"heading-3",
						"display-medium",
						"display-large",
						"overline",
					],
				},
			],
		},
	},
});

/** Merge conditional class names and resolve conflicting design-token utilities. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

export type { ClassValue };
