import {
	auth,
	betterAuthToCurrentUserInfoDto,
	type AuthSessionDto,
	type CurrentUserInfoDto,
} from "@cvsa/core";

export type CurrentAuth = {
	user: CurrentUserInfoDto | null;
	session: AuthSessionDto | null;
};

/**
 * Resolve the current visitor in-process through the shared better-auth
 * instance from @cvsa/core (already loaded in this process) instead of
 * round-tripping to the backend API. better-auth parses its own session
 * cookie, so the cookie name is never hardcoded here.
 *
 * Fail-safe: any failure degrades to anonymous so an auth outage never
 * breaks page rendering.
 */
export async function resolveCurrentAuth(request: Request): Promise<CurrentAuth> {
	// Fast path: without credential headers there is nothing to look up,
	// so skip the database entirely.
	if (!request.headers.has("cookie") && !request.headers.has("authorization")) {
		return { user: null, session: null };
	}

	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) {
			return { user: null, session: null };
		}
		return { user: betterAuthToCurrentUserInfoDto(session.user), session: session.session };
	} catch (error) {
		console.warn("[auth] failed to resolve session, treating visitor as anonymous", error);
		return { user: null, session: null };
	}
}

/** Point lookup of the current user; see {@link resolveCurrentAuth}. */
export async function resolveCurrentUser(request: Request): Promise<CurrentUserInfoDto | null> {
	return (await resolveCurrentAuth(request)).user;
}
