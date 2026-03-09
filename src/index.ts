import { Elysia, type ErrorHandler } from "elysia";
import { onAfterHandler } from "./onAfterHandle";
import { getBindingInfo, logStartup } from "./startMessage";
import pkg from "../package.json";
import { authHandler } from "@routes/auth";
import { AppError } from "@lib/error";
import { ZodError } from "zod";

const [host, port] = getBindingInfo();
logStartup(host, port);

const errorHandler: ErrorHandler<{
    readonly AppError: AppError;
}> = ({ code, status, error }) => {
    if (code === "NOT_FOUND")
        return status(404, {
            message: "The requested resource was not found.",
        });
    if (code === "VALIDATION") {
        const detail = error.detail(error.message)
        if (typeof detail === "string") {
            return status(422, {
                code: "VALIDATION_ERROR",
                message: detail,
            });
        }
        return status(422, {
            code: "VALIDATION_ERROR",
            message: detail.summary,
        });
    }
    if (error instanceof AppError) {
        return status(error.statusCode, {
            code: error.code,
            message: error.message,
        });
    }
    if (error instanceof ZodError) {
        return status(422, {
            code: "VALIDATION_ERROR",
            message: error.message,
        });
    }
    return status(500, {
        code: "SERVER_ERROR",
        message: "Internal server error",
    });
};

export const app = new Elysia({
    serve: {
        hostname: host,
    },
    prefix: "/v2",
})
    .error({
        AppError
    })
    .onError(errorHandler)
    .use(authHandler)
    .use(onAfterHandler)
    .listen(16412);

export const VERSION = pkg.version;

export type App = typeof app;
