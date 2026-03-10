import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { visit } from "unist-util-visit";

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
	dir: "content",
	docs: {
		schema: pageSchema,
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
	meta: {
		schema: metaSchema,
	},
});

function rehypeFootnote() {
	// biome-ignore lint/suspicious/noExplicitAny: I don't really know the type.
	return (tree: any) => {
		visit(tree, "element", (node) => {
			if (node.tagName === "h2" && node.properties?.id === "footnote-label") {
				node.children = [];
			}
		});
	};
}

export default defineConfig({
	mdxOptions: {
		// MDX options
		rehypePlugins: (v) => [rehypeFootnote, ...v],
	},
});
