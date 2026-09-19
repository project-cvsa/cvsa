/**
 * Eden Treaty transport for the web app.
 *
 * `@api-contract` is the backend's type-only entry point. It must stay a type
 * import: the backend module graph pulls in server-only code (Prisma, better-auth,
 * pino) that must never reach the browser bundle. `verbatimModuleSyntax` is on in
 * this app, so a value import fails the build instead of silently shipping.
 */
import type { App } from "@api-contract";
import { treaty, type Treaty } from "@elysiajs/eden";
import { asApiErrorBody, type ApiErrorInfo, type ApiResult } from "./result";

type EdenClient = ReturnType<typeof treaty<App>>;

/** The settled response of a single Eden endpoint call. */
export type EdenResponse = Treaty.TreatyResponse<Record<number, unknown>>;

/**
 * A resolved `treaty` call, described by the members this layer reads.
 *
 * Eden's own 204 member is `{ data: null, error: null }`, which no two-member
 * union can express, so `data` and `error` stay independent. That also lets
 * `TValue` and `TError` be inferred from their own member instead of collapsing
 * to their constraint.
 */
export type SettledResponse<TValue = unknown, TError = unknown> = {
	data: TValue | null;
	error: TError | null;
	status: number;
	response: Response;
};

type ApiErrorConstraint = {
	status: number | string;
	value: unknown;
};

let client: EdenClient | undefined;
let configuredBaseUrl: string | undefined;

const NETWORK_FAILURE_STATUS = 503;
const TRACE_ID_HEADER = "x-trace-id";

/**
 * Read the deployed API origin. Resolution is deferred to first use so a
 * missing variable cannot break module evaluation on an unrelated page.
 */
function resolveApiUrl(): string {
	const configured = import.meta.env.PUBLIC_API_URL;
	if (!configured) {
		throw new Error("PUBLIC_API_URL is not configured");
	}
	return configured;
}

/** Override the API origin; intended for tests. */
export function configureApiClient(options: { baseUrl: string }): void {
	configuredBaseUrl = options.baseUrl;
	client = undefined;
}

/** Locale forwarded as `x-locale`, resolved from the document's `lang`. */
function resolveLocale(): string | undefined {
	if (typeof document === "undefined") {
		return undefined;
	}
	return document.documentElement.lang || undefined;
}

/**
 * The shared Eden client. `treaty<App>()` reads the contract purely from the
 * type argument, so the backend package is never imported at runtime.
 */
export function getEdenClient(): EdenClient {
	if (client) {
		return client;
	}

	const eden = treaty<App>(configuredBaseUrl ?? resolveApiUrl(), {
		// The session lives in an httpOnly cookie; Eden's default fetcher does not
		// send it cross-origin unless credentials are included.
		fetch: { credentials: "include" },
		headers: () => {
			const locale = resolveLocale();
			if (!locale) {
				return {};
			}
			// The backend reads `x-locale` first and `accept-language` second.
			return { "x-locale": locale, "accept-language": locale };
		},
		// Keep wire timestamps as ISO strings; the DTOs type them as strings.
		parseDate: false,
	});

	client = eden;
	return eden;
}

function readTraceId(response: Response | undefined, errorValue: unknown): string | undefined {
	const headerTraceId = response?.headers.get(TRACE_ID_HEADER);
	if (headerTraceId) {
		return headerTraceId;
	}
	if (typeof errorValue === "object" && errorValue !== null && "traceId" in errorValue) {
		const traceId = errorValue.traceId;
		if (typeof traceId === "string") {
			return traceId;
		}
	}
	return undefined;
}

async function readResponseBody(response: Response | undefined): Promise<unknown> {
	if (!response) {
		return null;
	}
	// Eden consumes the body before returning, so this is a best-effort fallback
	// for responses it could not classify itself.
	if (response.bodyUsed) {
		return null;
	}
	return response.json().catch(() => null);
}

/**
 * Normalize an Eden result into {@link ApiResult}: successes carry their body,
 * failures carry a translated `code`/`message` pair plus the request trace id.
 *
 * `TValue` is inferred from the response's own `data` member, so the payload
 * needs no assertion; the null in the return type is the `204` case, which is a
 * successful response that simply has no body.
 */
export async function settle<TValue, TError extends ApiErrorConstraint>(
	settledResponse: SettledResponse<TValue, TError>
): Promise<ApiResult<TValue | null>> {
	const { data, error, status, response } = settledResponse;

	if (error === null) {
		return { ok: true, status, data };
	}

	// Prefer Eden's own classification; fall back to re-reading the response when
	// the failure sits outside the declared error schema.
	const errorBody =
		asApiErrorBody(error.value) ?? asApiErrorBody(await readResponseBody(response));
	const traceId = readTraceId(response, error.value);

	if (errorBody) {
		return {
			ok: false,
			status,
			error: { code: errorBody.code, message: errorBody.message, traceId },
		};
	}

	// No parseable envelope: either the request never reached the API (Eden
	// reports a thrown fetch as 503) or the server failed outside its own error
	// middleware.
	const code: ApiErrorInfo["code"] =
		status === NETWORK_FAILURE_STATUS ? "NETWORK_ERROR" : "INTERNAL_SERVER_ERROR";
	return { ok: false, status, error: { code, traceId } };
}
