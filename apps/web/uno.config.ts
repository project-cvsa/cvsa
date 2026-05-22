import { defineConfig } from "unocss";
import presetMini from "@unocss/preset-mini";

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
		breakpoints: {
			xs: "480px",
			sm: "640px",
			md: "768px",
			lg: "1024px",
			xl: "1280px",
			"2xl": "1536px",
		},
	},
});
