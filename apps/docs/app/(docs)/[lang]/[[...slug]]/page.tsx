import { source } from "@/lib/source";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { gitConfig } from "@/lib/layout.shared";
import { MarkdownCopyButton, ViewOptionsPopover } from "@/components/page-actions";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { t } from "@/lib/i18n";

export async function generateStaticParams() {
	const pages = source.getPages();
	return pages.map((p) => ({
		slug: p.slugs,
		lang: p.locale,
	}));
}

export const dynamicParams = false;

export default async function Page({
	params,
}: {
	params: Promise<{ lang: string; slug: string[] }>;
}) {
	const { slug: rawSlug, lang } = await params;
	const slug = rawSlug ? rawSlug : [];
	const page = source.getPage(slug, lang);
	const anotherLanguage = lang === "en" ? "zh" : "en";
	const anotherPage = source.getPage(slug, anotherLanguage);

	if (!page) notFound();

	const MDX = page.data.body;

	const currentPage = slug.length > 0 ? `${slug.join("/")}` : ``;

	return (
		<DocsPage toc={page.data.toc} full={page.data.full}>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription className="mb-0">{page.data.description}</DocsDescription>
			<div className="flex flex-row gap-2 items-center border-b pb-6">
				<MarkdownCopyButton lang={lang} markdownUrl={`/raw/${lang}/${currentPage}.mdx`} />
				{anotherPage && (
					<a
						className={buttonVariants({
							variant: "secondary",
							size: "sm",
							className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
						})}
						href={`/${anotherLanguage}/${currentPage}`}
					>
						{t("viewIn", anotherLanguage)}
					</a>
				)}
				<ViewOptionsPopover
					lang={lang}
					markdownUrl={`/raw/${currentPage}.mdx`}
					githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/${page.path}`}
				/>
			</div>
			<DocsBody>
				<MDX
					components={getMDXComponents({
						// this allows you to link to other pages with relative file paths
						a: createRelativeLink(source, page),
					})}
				/>
			</DocsBody>
		</DocsPage>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ lang: string; slug?: string[] }>;
}): Promise<Metadata> {
	const { slug, lang } = await params;
	const page = source.getPage(slug, lang);
	const baseUrl = "https://docs.projectcvsa.com";
	if (!page) notFound();
	const cleanSlug = slug ? slug : [];
	const currentPage = cleanSlug.join("/");
	const url = `${baseUrl}/${lang}/${currentPage}`;
	return {
		title: page.data.title,
		description: page.data.description,
		alternates: {
			canonical: url,
			languages: {
				zh: `${baseUrl}/zh/${currentPage}`,
				en: `${baseUrl}/en/${currentPage}`,
				"x-default": `${baseUrl}/en/${currentPage}`,
			},
		},
		openGraph: {
			title: page.data.title,
			description: page.data.description,
			url,
			siteName: "Project CVSA",
			locale: lang === "zh" ? "zh_CN" : "en_US",
			type: "article",
		},
		twitter: {
			card: "summary_large_image",
			title: page.data.title,
			description: page.data.description,
		},
	};
}
