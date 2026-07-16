import { i18nMiddleware } from "@lib/i18n/server";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
	const { request, redirect } = context;
	const i18nAction = i18nMiddleware(request);
	if (!i18nAction) {
		return new Response(null, {
			status: 403,
		});
	}
	if (i18nAction.action === "redirect") {
		return redirect(i18nAction.target, 302);
	}
	return next();
});
