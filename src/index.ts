import { Elysia, type ErrorHandler } from "elysia";
import { onAfterHandler } from "./onAfterHandle";
import { getBindingInfo, logStartup } from "./startMessage";
import pkg from "../package.json";

const [host, port] = getBindingInfo();
logStartup(host, port);

const errorHandler: ErrorHandler = ({ code, status, error }) => {
    if (code === "NOT_FOUND")
        return status(404, {
            message: "The requested resource was not found.",
        });
    if (code === "VALIDATION") return error.detail(error.message);
    return error;
};

const app = new Elysia({
    serve: {
        hostname: host,
    },
})
    .onError(errorHandler)
    .use(onAfterHandler)
    .listen(16412);

export const VERSION = pkg.version;

export type App = typeof app;
