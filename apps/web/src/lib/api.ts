const configuredApiUrl = import.meta.env.PUBLIC_API_URL;
if (!configuredApiUrl) {
	throw new Error("PUBLIC_API_URL is not configured");
}
export const API_URL: string = configuredApiUrl;

export interface ApiErrorBody {
	code: string;
	message?: string;
}

export type ApiResult =
	| {
			ok: true;
			status: number;
	  }
	| {
			ok: false;
			status: number;
			error: ApiErrorBody;
	  };

export async function apiRequest(
	method: "POST" | "DELETE",
	path: string,
	options?: { body?: unknown; locale?: string }
): Promise<ApiResult> {
	try {
		const response = await fetch(`${API_URL}${path}`, {
			method,
			headers: {
				...(options?.body !== undefined ? { "content-type": "application/json" } : {}),
				...(options?.locale ? { "x-locale": options.locale } : {}),
			},
			body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
			credentials: "include",
		});

		if (response.ok) {
			return { ok: true, status: response.status };
		}

		let parsed: unknown;
		try {
			parsed = await response.json();
		} catch {
			parsed = null;
		}
		const error: ApiErrorBody =
			typeof parsed === "object" &&
			parsed !== null &&
			"code" in parsed &&
			typeof parsed.code === "string"
				? {
						code: parsed.code,
						message:
							"message" in parsed && typeof parsed.message === "string"
								? parsed.message
								: undefined,
					}
				: { code: "UNKNOWN" };
		return { ok: false, status: response.status, error };
	} catch {
		return { ok: false, status: 0, error: { code: "NETWORK_ERROR" } };
	}
}
