import path from "node:path";
import { defineConfig } from "unocss";
import presetMini from "@unocss/preset-mini";
import { getUnoCSSColors } from "@lib/theme";

export default defineConfig({
	content: {
		filesystem: [
			path.resolve(
				import.meta.dirname,
				"src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"
			),
			"src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",
			"apps/web/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",
		],
	},
	presets: [
		presetMini({
			dark: "media",
		}),
	],
	rules: [
		["border", { "border-width": "1px", "border-style": "solid" }],
		[
			"sr-only",
			{
				position: "absolute",
				width: "1px",
				height: "1px",
				padding: "0",
				margin: "-1px",
				overflow: "hidden",
				clip: "rect(0,0,0,0)",
				"white-space": "nowrap",
				"border-width": "0",
			},
		],
		["uppercase", { "text-transform": "uppercase" }],
		["lowercase", { "text-transform": "lowercase" }],
		["capitalize", { "text-transform": "capitalize" }],
	],
	safelist: [
		"border",
		"border-border",
		"border-primary",
		"border-secondary",
		"border-transparent",
		"border-error",
		"bg-primary",
		"bg-secondary",
		"bg-surface",
		"bg-transparent",
		"bg-hover",
		"bg-error",
		"text-display",
		"text-display-inverted",
		"text-primary",
		"text-secondary",
		"text-tertiary",
		"text-quaternary",
		"text-error",
		"text-on-error",
		"hover:bg-secondary",
		"hover:border-secondary",
		"hover:bg-hover",
		"hover:bg-error",
		"hover:text-on-error",
		"hover:border-tertiary",
		"focus-visible:outline-1",
		"focus-visible:outline-offset-6",
		"focus-visible:outline-primary",
		"focus-within:border-primary",
		"focus-within:ring-1",
		"focus-within:ring-primary",
		"h-[58px]",
		"pt-[21px]",
		"pb-1",
		"w-full",
	],
	theme: {
		colors: getUnoCSSColors(),
		breakpoints: {
			xs: "480px",
			sm: "640px",
			md: "768px",
			lg: "1024px",
			xl: "1280px",
			"2xl": "1536px",
		},
		fontFamily: {
			body: `"Outfit", "system-ui", "sans-serif"`,
			code: `"IBM Plex Mono", "monospace"`,
		},

		fontSize: {
			"display-large": ["56px", "64px"],
			"display-medium": ["40px", "48px"],
			"heading-1": ["32px", "44px"],
			"heading-2": ["24px", "34px"],
			"heading-3": ["20px", "30px"],
			subhead: ["18px", "28px"],
			body: ["16px", "25px"],
			label: ["14px", "21px"],
			caption: ["12px", "17px"],
			overline: ["11px", "15px"],
		},

		letterSpacing: {
			"display-large": "-0.5px",
			"display-medium": "-0.2px",
			"heading-1": "0px",
			"heading-2": "0px",
			"heading-3": "0px",
			subhead: "0px",
			body: "0px",
			label: "0.1px",
			caption: "0.4px",
			overline: "1.2px",
		},

		boxShadow: {
			md: ["0 4px 8px var(--shadow)", "0 0 16px var(--shadow)"],
			xl: ["0 8px 16px var(--shadow)", "0 0 32px var(--shadow)"],
		},
	},
	shortcuts: {
		"ts-display-large": "text-display-large fw-300 tracking-display-large",
		"ts-display-medium": "text-display-medium fw-400 tracking-display-medium",
		"ts-heading-1": "text-heading-1 fw-500 tracking-heading-1",
		"ts-heading-2": "text-heading-2 fw-600 tracking-heading-2",
		"ts-heading-3": "text-heading-3 fw-600 tracking-heading-3",
		"ts-subhead": "text-subhead fw-500 tracking-subhead",
		"ts-body": "text-body fw-400 tracking-body",
		"ts-label": "text-label fw-600 tracking-label",
		"ts-caption": "text-caption fw-400 tracking-caption",
		"ts-overline": "text-overline fw-700 tracking-overline uppercase",
	},
});
