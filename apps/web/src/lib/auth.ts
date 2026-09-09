import { CurrentUserInfoSchema, SESSION_COOKIE_NAME, type CurrentUserInfoDto } from "@cvsa/core";
import { API_URL } from "@lib/api";

/**
 * Server-side helper: resolve the current user from the session cookie
 * by asking the backend API (Bearer token). Returns null when anonymous.
 */
export async function getCurrentUser(request: Request): Promise<CurrentUserInfoDto | null> {
	const cookieHeader = request.headers.get("cookie") ?? "";
	const cookieNames = [SESSION_COOKIE_NAME, `__Secure-${SESSION_COOKIE_NAME}`];
	let token: string | undefined;
	for (const part of cookieHeader.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const name = part.slice(0, eq).trim();
		if (cookieNames.includes(name)) {
			token = part.slice(eq + 1).trim();
			break;
		}
	}

	if (!token) {
		return null;
	}

	try {
		const response = await fetch(`${API_URL}/v2/me`, {
			headers: { authorization: `Bearer ${token}` },
		});
		if (!response.ok) {
			return null;
		}
		return CurrentUserInfoSchema.parse(await response.json());
	} catch {
		return null;
	}
}
