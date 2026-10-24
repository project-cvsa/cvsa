import { Elysia } from "elysia";
import { AppError } from "@cvsa/contracts";
import { crawlerEnv } from "@cvsa/env";
import { networkRuntimeRoutes } from "./networkRuntime";
import { trackingRoutes } from "./tracking";
import { discoveryRoutes } from "./discovery";

function errorResponse(error: AppError): {
	code: "ENTITY_CONFLICT" | "VALIDATION_ERROR" | "INTERNAL_SERVER_ERROR" | "NOT_FOUND";
	message: string;
} {
	if (error.code === "ENTITY_CONFLICT") {
		return { code: "ENTITY_CONFLICT", message: error.message };
	}
	if (error.code === "VALIDATION_ERROR") {
		return { code: "VALIDATION_ERROR", message: error.message };
	}
	if (error.code === "NOT_FOUND") {
		return { code: "NOT_FOUND", message: error.message };
	}
	return { code: "INTERNAL_SERVER_ERROR", message: error.message };
}

export const crawlerControlPlane = new Elysia({ name: "crawlerControlPlane", prefix: "/v2" })
	.onError(({ code, error, status }) => {
		if (AppError.isAppError(error)) {
			return status(error.statusCode, errorResponse(error));
		}
		if (code === "VALIDATION") {
			return status(422, { code: "VALIDATION_ERROR", message: "Invalid request" });
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
	.group("/discovery", (app) => app.use(discoveryRoutes));
