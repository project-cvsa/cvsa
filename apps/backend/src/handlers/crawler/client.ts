import { crawlerEnv } from "@cvsa/env";
import { AppError } from "@cvsa/contracts";

const CRAWLER_BASE_URL = `http://${crawlerEnv.CONTROL_API_HOST}:${crawlerEnv.CONTROL_API_PORT}/v2`;

export async function callCrawlerApi<T>(
	path: string,
	method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
	body?: unknown
): Promise<T> {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		...(crawlerEnv.CONTROL_API_TOKEN
			? { authorization: `Bearer ${crawlerEnv.CONTROL_API_TOKEN}` }
			: {}),
	};

	try {
		const res = await fetch(`${CRAWLER_BASE_URL}${path}`, {
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
			`Failed to communicate with crawler control plane: ${(error as Error).message}`,
			"THIRD_PARTY_ERROR",
			502
		);
	}
}
