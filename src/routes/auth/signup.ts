import { Elysia } from "elysia";
import { ip } from "elysia-ip";
import { rateLimit } from "elysia-rate-limit";
import { SignupRequestSchema, SignupResponse200Schema } from "@schemas/auth";
import { ErrorResponseSchema } from "@schemas/common";
import { RateLimitError } from "@lib/error/rateLimit";
import { authService } from "@/containers";

export const signupHandler = new Elysia()
    .decorate("authService", authService)
    .use(ip())
    .use(
        rateLimit({
            scoping: "global",
            max: 50,
            duration: 5 * 60 * 1000,
            generator: () => "", // global limit
            errorResponse: new RateLimitError(),
        })
    )
    .post(
        "/user",
        async ({ body, status, ip, headers, authService }) => {
            const userAgent = headers["user-agent"];
            const { user, token } = await authService.register(body, ip, userAgent);

            return status(200, {
                message: "Successfully registered",
                data: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    email: user.email,
                    token,
                },
            });
        },
        {
            body: SignupRequestSchema,
            detail: {
                summary: "User Registration",
                description: "",
            },
            response: {
                200: SignupResponse200Schema,
                400: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        }
    );
