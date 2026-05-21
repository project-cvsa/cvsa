import { Elysia } from "elysia";
import { artistRoleSearchService } from "@cvsa/core";
import z from "zod";
import { traceTask } from "@/common/trace";

// TODO: add corresponding DTO and response schema
export const artistRoleSearchHandler = new Elysia().get(
	"/artist-roles",
	async ({ query, status }) => {
		const result = await traceTask("artistRoleSearchService.search", async () => {
			return await artistRoleSearchService.search(query.q || "");
		});
		return status(200, result);
	},
	{
		detail: {
			summary: "Search for Artist Roles",
			description:
				"Full-text search across artist role names. Returns a list of matching roles ordered by relevance.",
		},
		query: z.object({
			q: z.string().optional(),
		}),
	}
);
