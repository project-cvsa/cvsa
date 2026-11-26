import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { visit } from "unist-util-visit";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";

const DOC_TYPES = ["tutorial", "how-to", "reference", "explanation", "plan"] as const;
const DOC_STATUSES = ["draft", "planned", "deprecated"] as const;

type DocType = (typeof DOC_TYPES)[number];
type DocStatus = (typeof DOC_STATUSES)[number];
type BasePageData = NonNullable<(typeof pageSchema)["~standard"]["types"]>["output"];

export type PageFrontmatter = BasePageData & {
	docType?: DocType;
	status?: DocStatus;
	reviewed?: boolean;
};

type SchemaPathSegment = PropertyKey | { readonly key: PropertyKey };

type SchemaIssue = {
	readonly message: string;
	readonly path?: ReadonlyArray<SchemaPathSegment>;
};

type ExtendedPageSchema = {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor: string;
		readonly types?: {
			readonly input: PageFrontmatter;
			readonly output: PageFrontmatter;
		};
		readonly validate: (
			value: unknown
		) => Promise<
			| { readonly value: PageFrontmatter; readonly issues?: undefined }
			| { readonly issues: ReadonlyArray<SchemaIssue> }
		>;
	};
};

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
	return typeof value === "string" && values.includes(value);
}

const extendedPageSchema: ExtendedPageSchema = {
	"~standard": {
		version: 1,
		vendor: "cvsa",
		async validate(value) {
			const baseResult = await pageSchema["~standard"].validate(value);
			if (baseResult.issues) {
				return baseResult;
			}

			const record =
				typeof value === "object" && value !== null && !Array.isArray(value)
					? Object.fromEntries(Object.entries(value))
					: {};
			const issues: SchemaIssue[] = [];
			const extra: Partial<Pick<PageFrontmatter, "docType" | "status" | "reviewed">> = {};

			if (record.docType !== undefined) {
				if (isOneOf(DOC_TYPES, record.docType)) {
					extra.docType = record.docType;
				} else {
					issues.push({
						message: `docType must be one of: ${DOC_TYPES.join(", ")}`,
						path: ["docType"],
					});
				}
			}

			if (record.status !== undefined) {
				if (isOneOf(DOC_STATUSES, record.status)) {
					extra.status = record.status;
				} else {
					issues.push({
						message: `status must be one of: ${DOC_STATUSES.join(", ")}`,
						path: ["status"],
					});
				}
			}

			if (record.reviewed !== undefined) {
				if (typeof record.reviewed === "boolean") {
					extra.reviewed = record.reviewed;
				} else {
					issues.push({
						message: "reviewed must be a boolean",
						path: ["reviewed"],
					});
				}
			}

			if (issues.length > 0) {
				return { issues };
			}

			return {
				value: {
					...baseResult.value,
					...extra,
				},
			};
		},
	},
};

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
	dir: "content",
	docs: {
		schema: extendedPageSchema,
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
		remarkPlugins: [remarkMdxMermaid],
	},
});
