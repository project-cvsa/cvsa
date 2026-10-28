import { crawlerEnv } from "@cvsa/env";
import { AppError } from "@cvsa/contracts";

const CRAWLER_CONNECT_HOST =
	crawlerEnv.CONTROL_API_HOST === "0.0.0.0" || crawlerEnv.CONTROL_API_HOST === "::"
		? "127.0.0.1"
		: crawlerEnv.CONTROL_API_HOST;

const CRAWLER_BASE_URL = (
	crawlerEnv.CONTROL_API_URL ?? `http://${CRAWLER_CONNECT_HOST}:${crawlerEnv.CONTROL_API_PORT}/v2`
).replace(/\/+$/, "");

export type CrawlerQueryValue = string | number | boolean | null | undefined;
export type CrawlerQuery = Record<string, CrawlerQueryValue>;

function buildQueryString(query?: CrawlerQuery): string {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null) continue;
		params.set(key, String(value));
	}
	const serialized = params.toString();
	return serialized ? `?${serialized}` : "";
}

export async function callCrawlerApi<T>(
	path: string,
	method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
	body?: unknown,
	query?: CrawlerQuery
): Promise<T> {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		...(crawlerEnv.CONTROL_API_TOKEN
			? { authorization: `Bearer ${crawlerEnv.CONTROL_API_TOKEN}` }
			: {}),
	};

	try {
		const res = await fetch(`${CRAWLER_BASE_URL}${path}${buildQueryString(query)}`, {
			method,
			headers,
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});

		if (!res.ok) {
			const errText = await res.text();
			if (res.status === 404) throw new AppError("error.not-found", "NOT_FOUND", 404);
			if (res.status === 409)
				throw new AppError("error.crawler.conflict", "ENTITY_CONFLICT", 409);
			if (res.status === 429) {
				throw new AppError("error.crawler.rate-limited", "CRAWLER_RATE_LIMITED", 429);
			}
			const unavailable = res.status >= 500 || res.status === 401 || res.status === 403;
			throw new AppError(
				unavailable ? "error.crawler.unavailable" : "error.crawler.request-failed",
				unavailable ? "CRAWLER_UNAVAILABLE" : "CRAWLER_REQUEST_FAILED",
				unavailable ? 502 : res.status,
				{ upstreamStatus: res.status, upstreamResponse: errText }
			);
		}

		return (await res.json()) as T;
	} catch (error) {
		if (AppError.isAppError(error)) throw error;
		throw new AppError("error.crawler.unavailable", "CRAWLER_UNAVAILABLE", 502, {
			cause: error instanceof Error ? error.message : String(error),
		});
	}
}
