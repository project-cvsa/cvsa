import { transform } from "@astrojs/compiler-rs";
import { defineConfig, type TranslationFactory } from "@fanee/tools";

const componentFactory: TranslationFactory = {
	name: "getComponentT",
	baseNamespace: "web:client",
	argument: "namespace",
};

const config = defineConfig({
	bundlePath: "locale",
	sourceLocale: "zh-CN",
	missingTranslations: "error",
	sources: [
		{
			include: ["apps/web/src/**/*.{ts,tsx}"],
			factories: [componentFactory],
		},
		{
			include: ["apps/web/src/**/*.astro"],
			factories: [{ name: "i18nServer.getT", baseNamespace: "web" }],
			transform: (source, file) => transform(source, { filename: file }).code,
		},
		{
			include: ["apps/web/src/components/pages/admin/crawler/labels.ts"],
			namespace: "web:client:crawler:discovery",
		},
		{
			include: ["apps/backend/src/**/*.ts"],
			functions: { "i18nRuntime.t": "backend" },
			factories: [{ name: "i18nRuntime.getT", baseNamespace: "backend" }],
		},
		{
			include: ["packages/*/src/**/*.ts"],
		},
	],
});

export default config;
