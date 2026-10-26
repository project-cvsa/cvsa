import { getLLMText, source } from "@/lib/source";
import { notFound } from "next/navigation";

export const revalidate = false;
export const dynamicParams = false;

export async function GET(_req: Request, { params }: RouteContext<"/raw/[lang]/[...slug]">) {
	const { slug, lang } = await params;
	if (slug[0] === "index.mdx" || slug[0] === "index.md") {
		const page = source.getPage([], lang);
		if (!page) notFound();
		return new Response(await getLLMText(page), {
			headers: {
				"Content-Type": "text/markdown; charset=utf-8",
			},
		});
	}
	const last = slug[slug.length - 1];
	const cleanSlug = [
		...slug.slice(0, slug.length - 1),
		last.endsWith(".mdx")
			? last.slice(0, last.length - 4)
			: last.endsWith(".md")
				? last.slice(0, last.length - 4)
				: last,
	];
	const page = source.getPage(cleanSlug, lang);
	if (!page) notFound();

	return new Response(await getLLMText(page), {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
		},
	});
}

export async function generateStaticParams() {
	const pages = source.getPages();
	return pages.map((p) => {
		const slugs = p.slugs;
		const len = slugs.length;
		if (len === 0) {
			return {
				slug: [`index.mdx`],
				lang: p.locale,
			};
		}
		const lastSlug = slugs[len - 1];
		const rest = slugs.slice(0, len - 1);
		return {
			slug: [...rest, `${lastSlug}.mdx`],
			lang: p.locale,
		};
	});
}
