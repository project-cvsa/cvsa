import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { siteUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
	const pages = source.getPages();

	const docPages = pages.map((page) => {
		const slug = page.slugs.join("/");
		const url = `${siteUrl}/${page.locale}${slug ? `/${slug}` : ""}`;

		return {
			url,
			lastModified: new Date(),
			changeFrequency: "weekly" as const,
			priority: page.slugs.length === 0 ? 0.8 : 0.6,
		};
	});

	const landingPage: MetadataRoute.Sitemap[number] = {
		url: siteUrl,
		lastModified: new Date(),
		changeFrequency: "monthly",
		priority: 1.0,
	};

	return [landingPage, ...docPages];
}