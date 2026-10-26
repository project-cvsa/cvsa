import { docs } from "collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { i18n } from "./i18n";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
	i18n,
	baseUrl: "/",
	source: docs.toFumadocsSource(),
	plugins: [lucideIconsPlugin()],
});

export function getPageImage(page: InferPageType<typeof source>) {
	const segments = [...page.slugs, "image.webp"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}

export async function getLLMText(page: InferPageType<typeof source>) {
	return page.data.getText("raw");
}
