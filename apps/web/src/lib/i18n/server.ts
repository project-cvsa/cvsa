import { i18n } from "@fanee/core";
import acceptLanguageParser from "accept-language-parser";
import { resources } from "virtual:fanee";
import { supportedBaseLanguages, supportedLanguages } from "./const";

export const i18nServer = i18n.config({
	defaultLocale: "zh-CN",
	baseNamespace: "web:server",
	resources,
});

await i18nServer.ready();

export const parseHostInfo = (urlStr: string) => {
	const url = new URL(urlStr);
	const parts = url.hostname?.split(".")?.reverse();

	if (!parts || parts.length < 2 || parts[0] !== "com" || parts[1] !== "projectcvsa") {
		return null;
	}

	const isDev = parts[2] === "dev";
	const languageInHost = isDev ? parts[3] : parts[2];

	return { isDev, languageInHost, hostname: url.hostname };
};

export const i18nMiddleware = (request: Request) => {
	const hostInfo = parseHostInfo(request.url);
	if (!hostInfo) return null;

	const { isDev, languageInHost } = hostInfo;
	const acceptLanguage = acceptLanguageParser.parse(
		request.headers.get("accept-language") ?? "en"
	);
	const languagePreferred = acceptLanguage[0]?.code;

	let resolvedLanguage = "en";
	if (languageInHost && supportedBaseLanguages.includes(languageInHost)) {
		resolvedLanguage = languageInHost;
	} else if (languagePreferred && supportedBaseLanguages.includes(languagePreferred)) {
		resolvedLanguage = languagePreferred;
	}

	if (!languageInHost || !supportedBaseLanguages.includes(languageInHost)) {
		const targetURL = new URL(request.url);
		const hostDevPart = isDev ? ".dev" : "";
		targetURL.hostname = `${resolvedLanguage}${hostDevPart}.projectcvsa.com`;

		return {
			action: "redirect" as const,
			target: targetURL.toString(),
		};
	}

	return { action: "next" as const };
};

const toFullLanguageCode = (entry: acceptLanguageParser.Language): string => {
	return entry.region ? `${entry.code}-${entry.region}` : entry.code;
};

export const getLocale = (request: Request) => {
	const hostInfo = parseHostInfo(request.url);
	const acceptLanguage = acceptLanguageParser.parse(
		request.headers.get("accept-language") ?? "en"
	);
	const preferred = acceptLanguage[0]?.code?.toLowerCase() ?? "en";

	const baseLanguage =
		[hostInfo?.languageInHost, preferred].find(
			(lang) => lang && supportedBaseLanguages.includes(lang)
		) ?? "en";

	const candidates = supportedLanguages.filter((lang) =>
		lang.toLowerCase().startsWith(`${baseLanguage.toLowerCase()}-`)
	);

	const acceptedFullCodes = acceptLanguage.map(toFullLanguageCode);

	const matchedCode = acceptedFullCodes.find((fullCode) =>
		candidates.some((candidate) => candidate.toLowerCase() === fullCode.toLowerCase())
	);

	const language =
		candidates.find((candidate) => candidate.toLowerCase() === matchedCode?.toLowerCase()) ??
		candidates[0] ??
		"en-US";

	return { language, baseLanguage };
};
