import { defineI18n } from "fumadocs-core/i18n";

export const i18n = defineI18n({
	defaultLanguage: "zh",
	languages: ["en", "zh"],
	hideLocale: "default-locale",
	// parser: 'dir'
});

const resources = {
	en: {
		more: "More",
		viewAsMarkdown: "View as Markdown",
		openInGitHub: "Open in GitHub",
		copyMarkdown: "Copy Markdown",
	},
	zh: {
		more: "更多",
		viewAsMarkdown: "查看 Markdown 源码",
		openInGitHub: "在 GitHub 中打开",
		copyMarkdown: "复制 Markdown",
	},
} as const;

type Resource = typeof resources;
type Lang = keyof Resource;
type MessageKey = keyof Resource[Lang];

export function t(key: MessageKey, lang: string): string {
	if (resources[lang as Lang] === undefined) {
		return key;
	}
	return resources[lang as Lang][key] || key;
}
