import { createSessionCookie, getSessionCookieName } from "@cvsa/core";
import { env } from "@cvsa/env";
import type { Context } from "elysia";

type CookieJar = Context["cookie"];

const DAY = 86400;

/** Set the signed better-auth session cookie on the response. */
export async function applySessionCookie(cookie: CookieJar, token: string): Promise<void> {
	const sessionCookie = await createSessionCookie(token);
	const tokenCookie = cookie[sessionCookie.name];
	tokenCookie.value = sessionCookie.value;
	tokenCookie.httpOnly = true;
	tokenCookie.maxAge = 90 * DAY;
	tokenCookie.secure = env.NODE_ENV === "production";
	tokenCookie.sameSite = "lax";
	tokenCookie.domain = env.COOKIE_DOMAIN;
}

/** Expire the session cookie on the response. */
export async function clearSessionCookie(cookie: CookieJar): Promise<void> {
	const tokenCookie = cookie[await getSessionCookieName()];
	tokenCookie.value = "";
	tokenCookie.expires = new Date(0);
	tokenCookie.maxAge = 0;
	tokenCookie.httpOnly = true;
	tokenCookie.secure = env.NODE_ENV === "production";
	tokenCookie.sameSite = "lax";
	tokenCookie.domain = env.COOKIE_DOMAIN;
}
