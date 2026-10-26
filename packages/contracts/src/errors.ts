import { z } from "zod";

export const APP_ERROR_MAGIC_NUMBER = 0x0712_0412_1099;

export class AppError extends Error {
	private readonly __type = APP_ERROR_MAGIC_NUMBER;

	constructor(
		public override message: string,
		public code: string,
		public statusCode: number = 500,
		public meta?: Record<string, unknown>
	) {
		super(message);
		this.name = new.target.name;
		Error.captureStackTrace(this, new.target);
	}

	static isAppError(obj: unknown): obj is AppError {
		if (!obj || typeof obj !== "object") {
			return false;
		}

		if (obj instanceof AppError) {
			return true;
		}

		return "__type" in obj && (obj as { __type: unknown }).__type === APP_ERROR_MAGIC_NUMBER;
	}
}

export const ErrorCodeEnum = z.enum([
	"NOT_FOUND",
	"VALIDATION_ERROR",
	"ENTITY_CONFLICT",
	"INVALID_CREDENTIALS",
	"AUTH_ERROR",
	"INTERNAL_SERVER_ERROR",
	"USERNAME_IS_ALREADY_TAKEN",
	"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
	"INVALID_EMAIL_OR_PASSWORD",
	"USER_NOT_FOUND",
	"EMAIL_NOT_VERIFIED",
	"UNAUTHORIZED",
	"FORBIDDEN",
]);

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

export const ErrorResponseSchema = z.object({
	code: ErrorCodeEnum,
	message: z.string().optional(),
	i18n: z.record(z.string(), z.string()).optional(),
	traceId: z.string().optional(),
});

export type ErrorResponseDto = z.infer<typeof ErrorResponseSchema>;
