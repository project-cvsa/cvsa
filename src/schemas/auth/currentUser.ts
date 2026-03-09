import z from "zod";

export const GetCurrentUserResponseSchema = z.object({
	id: z.string(),
	username: z.string(),
	displayName: z.string().optional().nullable(),
	email: z.email().optional().nullable(),
});
