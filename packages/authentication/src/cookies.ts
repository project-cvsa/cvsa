import { auth } from "./betterAuth";

export const SESSION_COOKIE_NAME = "cvsa.session_token";

/**
 * better-auth reads the session cookie back as a signed cookie
 * (`token.HMAC-SHA256(token, secret)` in base64), and its name gains a
 * `__Secure-` prefix in production — so both must come from the live
 * auth context instead of being hardcoded.
 */
export async function createSessionCookie(token: string): Promise<{ name: string; value: string }> {
	const context = await auth.$context;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(context.secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
	const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
	return { name: context.authCookies.sessionToken.name, value: `${token}.${encoded}` };
}

export async function getSessionCookieName(): Promise<string> {
	const context = await auth.$context;
	return context.authCookies.sessionToken.name;
}
