import { getLLMText, source } from "@/lib/source";
import { siteUrl } from "@/lib/env";
import { t } from "@/lib/i18n";

export const revalidate = false;

const HEADER = `# Project CVSA | 中V档案馆 — Full Documentation

> Project CVSA (中V档案馆) is an archive program that collects and preserves
> information about the Chinese singing voice synthesis community. This file
> contains the full markdown content of every documentation page on this site,
> concatenated for easy ingestion by LLMs and other automated tools.

## How to use this file

- The content is grouped by language, then by page.
- Each page is preceded by a level-2 heading with its title and URL.
- Pages within a language are separated by \`---\` dividers.
- Prefer citing the canonical page URL (linked in each section heading) over
  copying text from this file, so links stay current.

## Project links

- Project home: ${siteUrl}
- English docs: ${siteUrl}/en
- 中文文档: ${siteUrl}/zh
- Index of all pages: ${siteUrl}/llms.txt
- Markdown source of any single page: append \`/raw/<lang>/<page>.mdx\` to the site URL
- Sitemap: ${siteUrl}/sitemap.xml

---

`;

const SECTION_DIVIDER = "\n\n---\n\n";

export async function GET() {
	const pages = source.getPages();
	const sections: string[] = [];

	for (const lang of ["en", "zh"] as const) {
		const langPages = pages.filter((p) => p.locale === lang);
		if (langPages.length === 0) continue;

		const contents = await Promise.all(langPages.map(getLLMText));

		const blocks = langPages.map((page, i) => {
			const slug = page.slugs.join("/");
			const url = slug
				? `${siteUrl}/${lang}/${slug}`
				: `${siteUrl}/${lang}`;
			const title = page.data.title ?? slug;
			return `## [${title}](${url})\n\n${contents[i]}`;
		});

		sections.push(
			`# ${t("siteName", lang)} — ${lang.toUpperCase()}\n\n${blocks.join(SECTION_DIVIDER)}`,
		);
	}

	const body = `${HEADER}${sections.join(SECTION_DIVIDER)}`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
