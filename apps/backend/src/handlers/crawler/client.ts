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
			throw new AppError(
				`Crawler control plane returned error (${res.status}): ${errText}`,
				"THIRD_PARTY_ERROR",
				res.status >= 500 ? 502 : res.status
			);
		}

		return (await res.json()) as T;
	} catch (error) {
		if (AppError.isAppError(error)) throw error;
		throw new AppError(
			`Failed to communicate with crawler control plane: ${
				error instanceof Error ? error.message : String(error)
			}`,
			"THIRD_PARTY_ERROR",
			502
		);
	}
}
