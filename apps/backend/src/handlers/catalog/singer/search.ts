import { Elysia } from "elysia";
import { singerSearchService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

// TODO: add corresponding DTO and response schema
export const singerSearchHandler = new Elysia().get(
	"/singers",
	async ({ query, status }) => {
		const song = await traceTask("singerSearchService.search", async () => {
			return await singerSearchService.search(query.q || "");
		});
		return status(200, song);
	},
	{
		detail: {
			summary: "Search for Singers",
			description:
				"Full-text search across singer names, and descriptions. Returns a list of matching signers ordered by relevance.",
		},
		query: z.object({
			q: z.string().optional(),
		}),
	}
);
