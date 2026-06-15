import { z } from "zod";

const errorCodes = [
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
] as const;

export const ErrorResponseSchema = z.object({
	code: z.enum(errorCodes),
	message: z.string().optional(),
	i18n: z.record(z.string(), z.string()).optional(),
	traceId: z.string().optional(),
});

export type ErrorResponseDto = z.infer<typeof ErrorResponseSchema>;
