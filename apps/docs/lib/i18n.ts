import { defineI18n } from "fumadocs-core/i18n";

export const languages = ["en", "zh"];

export const i18n = defineI18n({
	defaultLanguage: "zh",
	languages: languages,
	fallbackLanguage: "en",
	hideLocale: "never",
	// parser: 'dir'
});

const resources = {
	en: {
		title: "Project CVSA | Archive for a Better Future",
		more: "More",
		viewAsMarkdown: "View as Markdown",
		openInGitHub: "Open in GitHub",
		copyMarkdown: "Copy Markdown",
		description:
			"Project CVSA is an archive program aiming to collect and preserve all information about the Chinese singing voice synthesis community.",
		viewIn: "View in English",
	},
	zh: {
		title: "中V档案馆 | Archive for a Better Future",
		more: "更多",
		viewAsMarkdown: "查看 Markdown 源码",
		openInGitHub: "在 GitHub 中打开",
		copyMarkdown: "复制 Markdown",
		description: "中V档案馆是一个归档计划，致力于收集与保存与中文虚拟歌手文化有关的一切信息。",
		viewIn: "查看中文版本",
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
