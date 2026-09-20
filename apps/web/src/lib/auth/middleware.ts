import { defineMiddleware } from "astro:middleware";
import { resolveCurrentAuth } from "@lib/auth/server";
import { ANONYMOUS_ONLY_ROUTES, AUTH_REQUIRED_ROUTES } from "@lib/auth/routes";
import { requireAnonymous, requireUser } from "@lib/auth/guards";

/**
 * Resolves the session once per request, exposes it via `Astro.locals`, then
 * enforces the route rule tables. Runs after the i18n handler so requests
 * that are about to be redirected anyway never touch the database.
 */
export const authMiddleware = defineMiddleware(async (context, next) => {
	const { user, session } = await resolveCurrentAuth(context.request);
	context.locals.user = user;
	context.locals.session = session;

	const pathname = context.url.pathname;
	const guard = ANONYMOUS_ONLY_ROUTES.some((route) => route.test(pathname))
		? requireAnonymous(context, user)
		: AUTH_REQUIRED_ROUTES.some((route) => route.test(pathname))
			? requireUser(context, user)
			: null;
	if (guard) {
		return guard;
	}

	return next();
});
