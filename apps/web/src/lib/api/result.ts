/**
 * Result contract shared by every API call in the web app.
 *
 * Hand-written rather than re-exported from `@cvsa/core` on purpose: the browser
 * client must not pull the backend's Prisma/better-auth module graph into its
 * bundle or its tests. The code list is still checked against the backend DTO,
 * so adding an error code on the backend fails `bun typecheck` here until it is
 * declared.
 */
import type { ErrorResponseDto } from "@cvsa/core";

export type BackendErrorCode = ErrorResponseDto["code"];

/** Codes the client can surface locally, on top of the backend's own set. */
export type ClientErrorCode = "NETWORK_ERROR";

export type ApiErrorCode = BackendErrorCode | ClientErrorCode;

export interface ApiErrorBody {
	code: ApiErrorCode;
	message?: string;
	i18n?: Record<string, string>;
	traceId?: string;
}

export interface ApiErrorInfo {
	code: ApiErrorCode;
	message?: string;
	traceId?: string;
}

export type ApiResult<T> =
	| {
			ok: true;
			status: number;
			data: T;
	  }
	| {
			ok: false;
			status: number;
			error: ApiErrorInfo;
	  };

/**
 * Every error code the client recognizes: the backend's enum plus the local one.
 *
 * The `satisfies` clause keeps the literals typed, and the exhaustiveness check
 * below turns a backend code missing from this list into a compile error.
 */
export const ERROR_CODES = [
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
	"NETWORK_ERROR",
] as const satisfies readonly ApiErrorCode[];

type DeclaredErrorCode = (typeof ERROR_CODES)[number];
type MissingErrorCodes = Exclude<ApiErrorCode, DeclaredErrorCode>;
type _NoMissingErrorCodes = [MissingErrorCodes] extends [never] ? true : never;
const _noMissingErrorCodes: _NoMissingErrorCodes = true;
void _noMissingErrorCodes;

const ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(ERROR_CODES);

/** True when `value` is one of the codes this client recognizes. */
export function isApiErrorCode(value: string): value is ApiErrorCode {
	return ERROR_CODE_SET.has(value);
}

/**
 * Narrow an unknown response body to the error envelope.
 *
 * Mirrors `ErrorResponseSchema` in `packages/core/src/error/schema.ts`: a
 * recognized `code` is what makes the body an error envelope, while the other
 * members stay optional.
 */
export function asApiErrorBody(value: unknown): ApiErrorBody | null {
	if (typeof value !== "object" || value === null || !("code" in value)) {
		return null;
	}
	const { code } = value;
	if (typeof code !== "string" || !isApiErrorCode(code)) {
		return null;
	}
	const envelope: Record<string, unknown> = { ...value };
	return {
		code,
		message: typeof envelope.message === "string" ? envelope.message : undefined,
		i18n: isStringRecord(envelope.i18n) ? envelope.i18n : undefined,
		traceId: typeof envelope.traceId === "string" ? envelope.traceId : undefined,
	};
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return Object.values(value).every((entry) => typeof entry === "string");
}
