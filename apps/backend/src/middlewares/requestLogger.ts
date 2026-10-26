import Elysia from "elysia";
import type { Logger } from "pino";
import { pinoLogger } from "@cvsa/logger";
import { ip } from "elysia-ip";
import { formatGinLog, getLogLevelForRequest } from "@common/log";

export interface RequestLoggerOptions {
	excludePaths?: string[];
}

export function createRequestLoggerMiddleware(pinoLogger: Logger<never>) {
	return new Elysia()
		.use(ip())
		.derive(function setRequestMeta() {
			return {
				startTime: Bun.nanoseconds() / 1_000_000,
			};
		})
		.onAfterHandle({ as: "global" }, function afterResponseLog(context) {
			const { request, ip, responseValue, startTime } = context;
			const requestPath = new URL(request.url).pathname;

			const status = (() => {
				if (!responseValue) {
					return undefined;
				}
				const r = responseValue as { status?: number };
				if (r.status) {
					return r.status;
				}
				const r2 = responseValue as { code?: number };
				if (r2.code) {
					return r2.code;
				}
				return undefined;
			})();

			const userAgent = request.headers?.get("user-agent") ?? undefined;

			const logData: Record<string, unknown> = {
				type: "http_request",
				method: request.method,
				path: requestPath,
				status,
				latency: startTime
					? `${(Bun.nanoseconds() / 1_000_000 - startTime).toFixed(3)}ms`
					: undefined,
				userAgent,
				ip,
			};

			pinoLogger[getLogLevelForRequest(status ?? 200)](formatGinLog(logData));
		});
}

export const requestLoggerMiddleware = createRequestLoggerMiddleware(pinoLogger);
