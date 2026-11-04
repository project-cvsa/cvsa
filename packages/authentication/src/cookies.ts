export const SESSION_COOKIE_NAME = "cvsa.session_token";
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

export function getSessionCookieName(): string {
	return SESSION_COOKIE_NAME;
}

export function createSessionCookie(token: string) {
	return {
		name: SESSION_COOKIE_NAME,
		value: token,
		maxAge: SESSION_MAX_AGE_SECONDS,
	};
}

export function parseTokenFromCookie(cookieHeader: string | null | undefined): string | null {
	if (!cookieHeader) return null;
	const regex = /(?:^|;\s*)cvsa\.session_token=([^;]*)/g;
	let lastValid: string | null = null;
	for (const match of cookieHeader.matchAll(regex)) {
		let raw = decodeURIComponent(match[1].trim());
		if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
			raw = raw.slice(1, -1).trim();
		}
		if (raw.length > 0) {
			lastValid = raw;
		}
	}
	return lastValid;
}

function hasGetHeader(headers: Headers | Record<string, string | undefined>): headers is Headers {
	return (
		headers instanceof Headers ||
		(typeof headers === "object" &&
			headers !== null &&
			"get" in headers &&
			typeof headers.get === "function")
	);
}

export function parseTokenFromHeaders(
	headers: Headers | Record<string, string | undefined>
): string | null {
	let authHeader: string | null | undefined;
	let cookieHeader: string | null | undefined;

	if (hasGetHeader(headers)) {
		authHeader = headers.get("authorization");
		cookieHeader = headers.get("cookie");
	} else {
		authHeader = headers.authorization;
		cookieHeader = headers.cookie;
	}

	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7).trim();
		if (token) return token;
	}

	return parseTokenFromCookie(cookieHeader);
}
