import { authService } from "@services/index";
import { AppError } from "@lib/error";
import { Elysia } from "elysia";
import z from "zod";
import { ErrorResponseSchema } from "@lib/schema";
import { ConflictError } from "@lib/error/conflict";
import { ip } from "elysia-ip";
import { rateLimit } from "elysia-rate-limit";
import { RateLimitError } from "@lib/error/rateLimit";

const SignupRequestSchema = z.object({
    username: z.string().min(1, { error: "用户名是必填项" }).max(100, { error: "用户名最多100个字符" }),
    password: z.string().min(6, { error: "密码至少需要8位" }).max(1024, { error: "密码最多1024个字符" }),
    displayName: z.string().max(100, { error: "昵称最多100个字符" }).optional().nullable(),
    email: z.email({ error: "邮箱格式不正确" }).optional().nullable(),
});

const SignupResponse200Schema = z.object({
    message: z.string(),
    data: z.object({
        id: z.string(),
        username: z.string(),
        displayName: z.string().optional().nullable(),
        email: z.email().optional().nullable(),
        token: z.string(),
    }),
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const signupHandler = new Elysia()
    .use(ip())
    .use(
        rateLimit({
            scoping: "global",
            max: 50,
            duration: 5 * 60 * 1000,
            generator: () => "", // 全局限制
            errorResponse: new RateLimitError(),
        })
    )
    .post(
        "/user",
        async ({ body, status, ip, headers }) => {
            try {
                const userAgent = headers["user-agent"];
                const requestBody = SignupRequestSchema.parse(body);
                const { user, token } = await authService.register(requestBody, ip, userAgent);
                return status(200, {
                    message: "注册成功",
                    data: {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        email: user.email,
                        token,
                    },
                });
            } catch (e) {
                if (e instanceof AppError) {
                    return status(500, { code: e.code, message: e.message });
                } else if (e instanceof ConflictError) {
                    return status(400, { code: e.code, message: e.message });
                } else if (e instanceof z.ZodError) {
                    return status(400, { code: "INVALID_REQUEST", message: e.message });
                } else {
                    return status(500, { code: "SERVER_ERROR", message: "内部错误" });
                }
            }
        },
        {
            body: SignupRequestSchema,
            detail: {
                summary: "用户注册",
                description: "",
            },
            response: {
                200: SignupResponse200Schema,
                400: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        }
    );
