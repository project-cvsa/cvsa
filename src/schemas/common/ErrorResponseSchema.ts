import { z } from "zod";

export const ErrorResponseSchema = z.object({
    code: z.string().optional(),
    message: z.string().optional(),
});
