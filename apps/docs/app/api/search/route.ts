import { source } from "@/lib/source";
import { createTokenizer } from "@orama/tokenizers/mandarin";
import { createFromSource } from "fumadocs-core/search/server";

// statically cached
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source, {
	localeMap: {
		zh: {
			components: {
				tokenizer: createTokenizer(),
			},
			search: {
				threshold: 0,
				tolerance: 0,
			},
		},
		en: { language: "english" },
	},
});
