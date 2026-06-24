import { source } from "@/lib/source";
import { llms } from "fumadocs-core/source";
import { siteUrl } from "@/lib/env";

export const revalidate = false;

const HEADER = `# Project CVSA | 中V档案馆

> Project CVSA (中V档案馆) is an archive program that collects and preserves
> information about the Chinese singing voice synthesis community. This site
> documents the project's mission, data model, architecture, and contribution
> guidelines for both English and Chinese readers.

This file is an LLM-friendly index of every documentation page on this site.
Each entry links to a page and summarizes what it covers.

- Project home: ${siteUrl}
- English docs: ${siteUrl}/en
- 中文文档: ${siteUrl}/zh
- Full content of all pages: ${siteUrl}/llms-full.txt
- Markdown source of any page: append \`/raw/<lang>/<page>.mdx\` to the site URL
- Sitemap: ${siteUrl}/sitemap.xml

For each page, prefer the canonical URL that matches the reader's language.
When in doubt, link to the English version.

---

`;

export function GET() {
	const index = llms(source).index();
	const body = `${HEADER}${index}`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
