import { getTraceId } from "@/common/trace";
import { Elysia } from "elysia";

const getLocale = (headers: Record<string, string | undefined>) => {
	if (headers["x-locale"]) {
		return {
			locale: headers["x-locale"],
		};
	}
	const acceptLang = headers["accept-language"];
	if (acceptLang) {
		const langList = acceptLang.split(",");
		for (const lang of langList) {
			if (lang.includes("zh")) {
				return {
					locale: "zh",
				};
			} else if (lang.includes("en")) {
				return {
					locale: "en",
				};
			}
		}
	}
	return {
		locale: "en",
	};
};

export const i18nMiddleware = new Elysia({ name: "i18nMiddleware" })
	.state("locale", {} as Record<string, string>)
	.onError({ as: "global" }, ({ request, store }) => {
		const traceId = getTraceId();
		const { locale } = getLocale(Object.fromEntries(request.headers.entries()));
		if (traceId) {
			store.locale = {};
			store.locale[traceId] = locale;
		}
	})
	.derive({ as: "scoped" }, ({ headers }) => {
		return getLocale(headers);
	});
