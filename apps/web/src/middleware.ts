import { sequence } from "astro:middleware";
import { defineMiddleware } from "astro:middleware";
import { i18nMiddleware } from "@lib/i18n/server";
import { authMiddleware } from "@lib/auth/middleware";

const i18nHandler = defineMiddleware((context, next) => {
	const i18nAction = i18nMiddleware(context.request);
	if (!i18nAction) {
		return new Response(null, {
			status: 403,
		});
	}
	if (i18nAction.action === "redirect") {
		return context.redirect(i18nAction.target, 302);
	}
	return next();
});

// i18n runs first so language redirects / 403s short-circuit before the
// auth middleware spends a database round-trip on a doomed request.
export const onRequest = sequence(i18nHandler, authMiddleware);
