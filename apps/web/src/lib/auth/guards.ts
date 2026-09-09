import type { APIContext } from "astro";
import type { CurrentUserInfoDto } from "@cvsa/core";

/**
 * Build the /login redirect target preserving the originally requested
 * path (same-site path validation happens on the login page).
 */
export function loginRedirectTarget(pathname: string, search: string): string {
	return `/login?redirect=${encodeURIComponent(pathname + search)}`;
}

/** Page guard: redirect anonymous visitors to the login page. */
export function requireUser(
	context: APIContext,
	user: CurrentUserInfoDto | null
): Response | null {
	if (user) {
		return null;
	}
	return context.redirect(loginRedirectTarget(context.url.pathname, context.url.search), 302);
}

/** Page guard: redirect logged-in visitors away (for login/register pages). */
export function requireAnonymous(
	context: APIContext,
	user: CurrentUserInfoDto | null
): Response | null {
	return user ? context.redirect("/", 302) : null;
}
