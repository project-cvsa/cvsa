import { defineConfig } from "unocss";
import presetMini from "@unocss/preset-mini";
import { getUnoCSSColors } from "@lib/theme";

export default defineConfig({
	presets: [
		presetMini({
			dark: "media",
		}),
	],
	rules: [
		["uppercase", { "text-transform": "uppercase" }],
		["lowercase", { "text-transform": "lowercase" }],
		["capitalize", { "text-transform": "capitalize" }],
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
		fontSize: {
			"display-large": ["56px", "64px"],
			"display-medium": ["40px", "48px"],
			"heading-1": ["32px", "44px"],
			"heading-2": ["24px", "34px"],
			"heading-3": ["20px", "30px"],
			subhead: ["18px", "28px"],
			body: ["17px", "27px"],
			label: ["15px", "22px"],
			caption: ["13px", "18px"],
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
	},
	shortcuts: {
		"ts-display-large": "text-display-large fw-300 tracking-display-large",
		"ts-display-medium": "text-display-medium fw-400 tracking-display-medium",
		"ts-heading-1": "text-heading-1 fw-500 tracking-heading-1",
		"ts-heading-2": "text-heading-2 fw-600 tracking-heading-2",
		"ts-heading-3": "text-heading-3 fw-600 tracking-heading-3",
		"ts-subhead": "text-subhead fw-500 tracking-subhead",
		"ts-body": "text-body fw-400 tracking-body",
		"ts-label": "text-label fw-500 tracking-label",
		"ts-caption": "text-caption fw-400 tracking-caption",
		"ts-overline": "text-overline fw-700 tracking-overline uppercase",
	},
});
