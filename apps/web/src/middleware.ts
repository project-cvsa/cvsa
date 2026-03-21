import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
	const { url, request, redirect } = context;

	if (url.pathname !== "/") {
		return next();
	}

	const acceptLanguage = request.headers.get("accept-language");

	let preferredLocale = "en";

	if (!acceptLanguage) {
		return redirect(`/${preferredLocale}`, 302);
	}

	if (acceptLanguage.includes("zh")) {
		preferredLocale = "zh";
	} else if (acceptLanguage.includes("ja")) {
		preferredLocale = "jp";
	}

	return redirect(`/${preferredLocale}`, 302);
});
