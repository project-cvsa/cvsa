import { Elysia } from "elysia";
import { artistSearchService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

// TODO: add corresponding DTO and response schema
export const artistSearchHandler = new Elysia().get(
	"/artists",
	async ({ query, status }) => {
		const song = await traceTask("artistSearchService.search", async () => {
			return await artistSearchService.search(query.q || "");
		});
		return status(200, song);
	},
	{
		detail: {
			summary: "Search for Artists",
			description:
				"Full-text search across artist names, aliases, and descriptions. Returns a list of matching artists ordered by relevance.",
		},
		query: z.object({
			q: z.string().optional(),
		}),
	}
);
