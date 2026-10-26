import { Elysia } from "elysia";
import { AppError, ErrorResponseSchema, SingerDetailsResponseSchema } from "@cvsa/contracts";
import { singerReader } from "@cvsa/catalog";
import z from "zod";
import { traceTask } from "@/common/trace";

export const singerGetHandler = new Elysia().get(
	"/singer/:id",
	async ({ params, status }) => {
		const singer = await traceTask("singerReader.getDetails", async () => {
			const res = await singerReader.getDetails(params.id);
			if (!res) {
				throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
			}
			return res;
		});
		return status(200, singer);
	},
	{
		detail: {
			summary: "Get Singer",
			description:
				"Retrieve detailed information about a specific singer by its ID. Includes name, description, language, and metadata.",
		},
		response: {
			200: SingerDetailsResponseSchema,
			400: ErrorResponseSchema,
			404: ErrorResponseSchema,
		},
		params: z.object({
			id: z.coerce.number().int().positive(),
		}),
	}
);
