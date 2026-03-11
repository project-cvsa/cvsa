import { AppError } from "@common/error";
import { BetterAuthAPIError } from "@project-cvsa/core";
import type { ErrorHandler } from "elysia";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler<{
	readonly AppError: AppError;
}> = ({ code, status, error }) => {
	if (code === "NOT_FOUND")
		return status(404, {
			message: "The requested resource was not found.",
		});
	if (code === "VALIDATION") {
		const detail = error.detail(error.message);
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
	if (error instanceof BetterAuthAPIError) {
		if (
			["USERNAME_IS_ALREADY_TAKEN", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"].includes(
				error.body?.code || ""
			)
		) {
			return status(409, {
				code: error.body?.code,
				message: error.body?.message,
			});
		}
		return status(error.statusCode, {
			code: error.body?.code,
			message: error.body?.message,
		});
	}
	return status(500, {
		code: "SERVER_ERROR",
		message: "Internal server error",
	});
};
