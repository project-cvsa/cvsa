import { AppError } from "@lib/error";
import { Elysia } from "elysia";
import z from "zod";
import { ErrorResponseSchema } from "@lib/schema";
import { authService } from "@services/index";

const authSchema = z
    .string()
    // 1. 长度收窄：Bearer (7) + hex(30) + dot(1) + hex(30) = 68
    .length(68, { error: "未登录" })
    .startsWith("Bearer ", { error: "未登录" })
    .transform((val) => val.split(" ")[1])
    // 2. 细化校验：确保剩下的 61 位符合 hex.hex 格式
    .refine((token) => token && /^[0-9a-fA-F]{30}\.[0-9a-fA-F]{30}$/.test(token), { error: "未登录" });

const GetCurrentUser200Schema = z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().optional().nullable(),
    email: z.email().optional().nullable(),
});

export const getCurrentUserHandler = new Elysia().get(
    "/me",
        async ({ headers, status }) => {
            try {
                const auth = headers.authorization;
                const token = authSchema.parse(auth);
                if (!token) {
                    return status(401, { code: "UNAUTHORIZED", message: "未登录" });
                }
                const user = await authService.verifyToken(token);
                if (!user) {
                    return status(401, { code: "UNAUTHORIZED", message: "未登录" });
                }
                return status(200, {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    email: user.email,
                });
            } catch (e) {
            if (e instanceof AppError) {
                return status(500, { code: e.code, message: e.message });
            } else if (e instanceof z.ZodError) {
                const firstMessage = e.issues[0]?.message || "请求参数非法";
                return status(400, { code: "INVALID_REQUEST", message: firstMessage });
            } else {
                return status(500, { code: "SERVER_ERROR", message: "内部错误" });
            }
        }
    },
    {
        body: GetCurrentUser200Schema,
        detail: {
            summary: "获取当前用户",
            description: "",
        },
        response: {
            200: GetCurrentUser200Schema,
            400: ErrorResponseSchema,
            401: ErrorResponseSchema,
            500: ErrorResponseSchema,
        },
    }
);
