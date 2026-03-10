import { defineI18nUI } from "fumadocs-ui/i18n";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { i18n } from "./i18n";
import { LogoChinese } from "@/components/icon/LogoChinese";
import { LogoEnglish } from "@/components/icon/LogoEnglish";

export const i18nUI = defineI18nUI(i18n, {
	translations: {
		en: {
			displayName: "English",
		},
		zh: {
			displayName: "中文",
			search: "搜索",
			toc: "目录",
			searchNoResult: "没有找到结果",
		},
	},
});

// fill this with your actual GitHub info, for example:
export const gitConfig = {
	user: "project-cvsa",
	repo: "cvsa",
	branch: "main",
};

export function baseOptions(locale: string): BaseLayoutProps {
	return {
		i18n,
		nav: {
			title: (
				<>
					{locale === "zh" ? (
						<LogoChinese className="text-md" />
					) : (
						<LogoEnglish className="text-md" />
					)}
				</>
			),
		},
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	};
}
