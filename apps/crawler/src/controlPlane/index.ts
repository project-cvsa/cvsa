import { Elysia } from "elysia";
import { AppError, type ErrorCode, ErrorCodeEnum } from "@cvsa/contracts";
import { crawlerEnv } from "@cvsa/env";
import { networkRuntimeRoutes } from "./networkRuntime";
import { trackingRoutes } from "./tracking";
import { discoveryRoutes } from "./discovery";
import { statsRoutes } from "./stats";

function errorResponse(error: AppError): {
	code: ErrorCode;
	message: string;
} {
	const parsed = ErrorCodeEnum.safeParse(error.code);
	return {
		code: parsed.success ? parsed.data : "INTERNAL_SERVER_ERROR",
		message: error.message,
	};
}

export const crawlerControlPlane = new Elysia({ name: "crawlerControlPlane", prefix: "/v2" })
	.onError(({ code, error, status }) => {
		if (AppError.isAppError(error)) {
			return status(error.statusCode, errorResponse(error));
		}
		if (code === "VALIDATION") {
			return status(422, { code: "VALIDATION_ERROR", message: "Invalid request" });
		}
		if (code === "NOT_FOUND") {
			// Elysia reports an unmatched route as NOT_FOUND; without this branch it
			// falls through to the 500 fallback and hides real client mistakes.
			return status(404, { code: "NOT_FOUND", message: "Route not found" });
		}
		return status(500, { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
	})
	.onBeforeHandle(({ headers, status }) => {
		if (
			!crawlerEnv.CONTROL_API_TOKEN ||
			headers.authorization !== `Bearer ${crawlerEnv.CONTROL_API_TOKEN}`
		) {
			return status(401, { code: "UNAUTHORIZED", message: "Unauthorized" });
		}
	})
	.group("/network-runtime", (app) => app.use(networkRuntimeRoutes))
	.group("/tracking", (app) => app.use(trackingRoutes))
	.group("/discovery", (app) => app.use(discoveryRoutes))
	.group("/stats", (app) => app.use(statsRoutes));
