import { Elysia } from "elysia";
import acceptLanguageParser from "accept-language-parser";

const supportedLocale = (language: string) => {
	const base = language.split("-")[0]?.toLowerCase();
	return base === "zh" || base === "en" ? base : undefined;
};

const getLocale = (headers: Record<string, string | undefined>) => {
	const explicit = headers["x-locale"];
	const locale = explicit ? supportedLocale(explicit) : undefined;
	if (locale) return { locale };
	const preferred = acceptLanguageParser
		.parse(headers["accept-language"] ?? "")
		.filter((language) => language.quality > 0)
		.map((language) => supportedLocale(language.code))
		.find((language) => language !== undefined);
	return { locale: preferred ?? "en" };
};

export const i18nMiddleware = new Elysia({ name: "i18nMiddleware" })
	.state("locale", {} as Record<string, string>)
	.onError({ as: "global" }, ({ request, store }) => {
		// `store.traceId` is assigned by the request-scoped error handler before
		// this runs, and falls back to a generated id when no span is active.
		const traceId = (store as { traceId?: string }).traceId;
		const { locale } = getLocale(Object.fromEntries(request.headers.entries()));
		if (traceId) {
			store.locale = {};
			store.locale[traceId] = locale;
		}
	})
	.derive({ as: "scoped" }, ({ headers }) => {
		return getLocale(headers);
	});
