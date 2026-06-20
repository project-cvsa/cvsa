import type { Settings } from "meilisearch";
// import { env } from "@cvsa/core/common";

export const INDEX_SETTINGS: Record<string, Settings> = {
	song: {
		searchableAttributes: [
			"name",
			"lyrics",
			"description",
			"singers",
			"artists",
			"bilibiliAid",
			"bilibiliBvid",
		],
		filterableAttributes: ["type", "tags", "singers", "engine"],
		sortableAttributes: ["publishedAt", "bilibiliViews"],
		rankingRules: [
			"words",
			"typo",
			"proximity",
			"attributeRank",
			"sort",
			"wordPosition",
			"exactness",
		],
		embedders: {
			"potion-multilingual-128M": {
				source: "userProvided",
				dimensions: 256,
			},
			// TODO: Remove this
			// 			"qwen3-embedding-8b-openrouter": {
			// 				source: "rest",
			// 				url: "https://openrouter.ai/api/v1/embeddings",
			// 				request: {
			// 					model: "qwen/qwen3-embedding-8b",
			// 					input: ["{{text}}", "{{..}}"],
			// 					encoding_format: "float",
			// 				},
			// 				response: {
			// 					data: [{ embedding: "{{embedding}}" }, "{{..}}"],
			// 				},
			// 				apiKey: env.OPENROUTER_KEY,
			// 				dimensions: 4096,
			// 				documentTemplate: `Instruct: You are providing search results for songs in the database.
			// Query: This song has the following properties.
			// Name: {{doc.name}},

			// Singers: {% for singer in doc.singers %}
			//   {{ singer }}
			// {% endfor %}
			// Artists: {% for artist in doc.artists %}
			//   {{ artist }}
			// {% endfor %}`,
			// 			},
		},
	},
	artist: {
		searchableAttributes: ["name", "description", "aliases"],
		rankingRules: ["attribute", "words", "proximity", "exactness", "typo", "sort"],
		embedders: {
			"potion-multilingual-128M": {
				source: "userProvided",
				dimensions: 256,
			},
		},
	},
	singer: {
		searchableAttributes: ["name", "description", "language"],
		rankingRules: ["attribute", "words", "proximity", "exactness", "typo", "sort"],
		embedders: {
			"potion-multilingual-128M": {
				source: "userProvided",
				dimensions: 256,
			},
		},
	},
	artistRole: {
		searchableAttributes: ["name"],
		rankingRules: ["attribute", "words", "proximity", "exactness", "typo", "sort"],
		embedders: {
			"potion-multilingual-128M": {
				source: "userProvided",
				dimensions: 256,
			},
		},
	},
};
