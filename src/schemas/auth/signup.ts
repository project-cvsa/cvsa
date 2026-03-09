import z from "zod";

export const SignupRequestSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(6),
    displayName: z.string().max(100).optional().nullable(),
    email: z.email().optional().nullable(),
});

export const SignupResponse200Schema = z.object({
    message: z.string(),
    data: z.object({
        id: z.string(),
        username: z.string(),
        displayName: z.string().optional().nullable(),
        email: z.email().optional().nullable(),
        token: z.string(),
    }),
});