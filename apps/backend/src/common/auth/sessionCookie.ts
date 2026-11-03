import { createSessionCookie, getSessionCookieName } from "@cvsa/authentication";
import { env } from "@cvsa/env";
import type { Context } from "elysia";

type CookieJar = Context["cookie"];

const DAY = 86400;

function resolveCookieDomain(): string | undefined {
	if (env.COOKIE_DOMAIN) return env.COOKIE_DOMAIN;
	if (env.NODE_ENV === "production") return ".projectcvsa.com";
	return undefined;
}

/** Set the session cookie on the response. */
export async function applySessionCookie(cookie: CookieJar, token: string): Promise<void> {
	const sessionCookie = createSessionCookie(token);
	const tokenCookie = cookie[sessionCookie.name];
	tokenCookie.value = sessionCookie.value;
	tokenCookie.path = "/";
	tokenCookie.httpOnly = true;
	tokenCookie.maxAge = 90 * DAY;
	tokenCookie.secure = env.NODE_ENV === "production";
	tokenCookie.sameSite = "lax";
	const domain = resolveCookieDomain();
	if (domain) {
		tokenCookie.domain = domain;
	}
}

/** Expire the session cookie on the response. */
export async function clearSessionCookie(cookie: CookieJar): Promise<void> {
	const tokenCookie = cookie[getSessionCookieName()];
	tokenCookie.value = "";
	tokenCookie.path = "/";
	tokenCookie.expires = new Date(0);
	tokenCookie.maxAge = 0;
	tokenCookie.httpOnly = true;
	tokenCookie.secure = env.NODE_ENV === "production";
	tokenCookie.sameSite = "lax";
	const domain = resolveCookieDomain();
	if (domain) {
		tokenCookie.domain = domain;
	}
}
