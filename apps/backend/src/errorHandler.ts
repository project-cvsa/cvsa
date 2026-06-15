import { Elysia, ElysiaCustomStatusResponse } from "elysia";
import { AppError, BetterAuthAPIError } from "@cvsa/core";
import { appLogger, pinoLogger } from "@cvsa/logger";
import type { ErrorResponseDto } from "@cvsa/core";
import { getErrorResponse } from "@/common/error";
import { getTraceId } from "@/common/trace";
import { i18nMiddleware } from "@/middlewares";
import { ip } from "elysia-ip";
import { formatGinLog, getLogLevelForRequest } from "@common/log";

const AUTH_INVALID_CODES = [
	"INVALID_CREDENTIALS",
	"INVALID_EMAIL_OR_PASSWORD",
	"USER_NOT_FOUND",
	"EMAIL_NOT_VERIFIED",
] as const;

type AuthInvalidCode = (typeof AUTH_INVALID_CODES)[number];

interface ErrorStoreData {
	status: number;
	request: Request;
	data: ErrorResponseDto;
	locale?: string;
	rawError?: unknown;
	known: boolean;
}

type ErrorStore = Record<string, ErrorStoreData>;

export const errorHandler = new Elysia()
	.error({
		AppError,
	})
	.state("error", {} as ErrorStore)
	.state("startTime", {} as Record<string, number>)
	.use(ip())
	.onRequest(function setRequestMeta({ store }) {
		store.startTime = {};
		store.error = {};
		const traceId = getTraceId() ?? "";
		if (traceId) {
			store.startTime[traceId] = Bun.nanoseconds() / 1_000_000;
		}
	})
	.use(i18nMiddleware)
	.onError({ as: "global" }, ({ code, error, set, store, request }) => {
		const traceId = getTraceId() ?? "";
		if (traceId) {
			set.headers["X-Trace-ID"] = traceId;
		}

		const setErrorResponse = (status: number, data: ErrorResponseDto) => {
			store.error[traceId] = {
				data,
				status,
				locale: store.locale[traceId],
				request,
				rawError: error,
				known: true,
			};
		};

		if (AppError.isAppError(error)) {
			setErrorResponse(error.statusCode, {
				code: error.code as ErrorResponseDto["code"],
				message: error.message,
			});
		} else if (code === "NOT_FOUND") {
			setErrorResponse(404, {
				code: "NOT_FOUND",
				message: "error.not-found",
			});
		} else if (code === "VALIDATION") {
			// const detail = error.detail(error.message);
			// const message = typeof detail === "string" ? detail : detail.summary;
			setErrorResponse(422, {
				code: "VALIDATION_ERROR",
				message: "error.validation",
			});
		} else if (error instanceof BetterAuthAPIError) {
			const bodyCode = error.body?.code || "";

			if (bodyCode === "USERNAME_IS_ALREADY_TAKEN") {
				setErrorResponse(409, {
					code: bodyCode,
					message: "error.username-taken",
				});
			} else if (bodyCode === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
				setErrorResponse(409, {
					code: bodyCode,
					message: "error.email-taken",
				});
			} else if (AUTH_INVALID_CODES.includes(bodyCode as AuthInvalidCode)) {
				setErrorResponse(401, {
					code: "INVALID_CREDENTIALS",
					message: "error.invalid-cred",
				});
			} else if (error.statusCode < 500) {
				setErrorResponse(error.statusCode, {
					code: "UNAUTHORIZED",
					message: error.body?.message,
				});
			}
		} else if (error instanceof ElysiaCustomStatusResponse) {
			if (error.code === 404) {
				setErrorResponse(error.code, {
					code: "NOT_FOUND",
					message: "error.not-found",
				});
			}
		} else {
			setErrorResponse(500, {
				code: "INTERNAL_SERVER_ERROR",
				message: "error.internal",
			});
			store.error[traceId].known = false;
		}
	})
	.onError({ as: "global" }, function logErrorResponse({ store, status: statusFunc, ip }) {
		const traceId = getTraceId() ?? "";
		const { request, locale, data, status, rawError, known } = store.error[traceId];
		const startTime = store.startTime[traceId];
		const requestPath = new URL(request.url).pathname;

		const userAgent = request.headers?.get("user-agent") ?? undefined;

		const logData = {
			type: "http_request",
			method: request.method,
			path: requestPath,
			status,
			latency: startTime
				? `${(Bun.nanoseconds() / 1_000_000 - startTime).toFixed(3)}ms`
				: undefined,
			userAgent,
			ip,
			error: Bun.inspect(rawError),
			errorCode: data.code,
		};
		if (!known) {
			appLogger[getLogLevelForRequest(status ?? 500)](logData.error, data);
		}
		pinoLogger[getLogLevelForRequest(status ?? 500)](formatGinLog(logData));
		return getErrorResponse(statusFunc, status, locale, data);
	});
