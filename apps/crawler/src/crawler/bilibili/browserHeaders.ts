import {
	BrowserIdentityConfigSchema,
	type BrowserIdentityConfig,
	type BilibiliCredentialBundle,
} from "@cvsa/contracts";

type Identity = BilibiliCredentialBundle["identity"];

export function chooseBrowserIdentity(
	config: BrowserIdentityConfig,
	random: () => number = Math.random
): Identity {
	const validated = BrowserIdentityConfigSchema.parse(config);
	const families: Identity["family"][] = ["chrome", "edge", "safari"];
	const family =
		validated.family === "auto"
			? (families[Math.min(families.length - 1, Math.floor(random() * families.length))] ??
				"chrome")
			: validated.family;
	const version =
		family === "chrome"
			? validated.chromeVersion
			: family === "edge"
				? validated.edgeVersion
				: validated.safariVersion;
	return { family, version, language: validated.language };
}

export function browserRequestHeaders(
	identity: Identity,
	url: string,
	method = "GET",
	extra: Record<string, string> = {}
): Record<string, string> {
	const target = new URL(url);
	const managed = new Set([
		"user-agent",
		"accept-language",
		"sec-ch-ua",
		"sec-ch-ua-mobile",
		"sec-ch-ua-platform",
		"sec-fetch-site",
		"sec-fetch-mode",
		"sec-fetch-dest",
		"priority",
	]);
	const supplied = Object.fromEntries(
		Object.entries(extra).filter(
			([key]) =>
				!managed.has(key.toLowerCase()) &&
				!key.toLowerCase().startsWith("sec-ch-ua") &&
				!key.toLowerCase().startsWith("sec-fetch-")
		)
	);
	const initiator = new URL(
		extra.Origin ??
			extra.origin ??
			extra.Referer ??
			extra.referer ??
			"https://www.bilibili.com/"
	);
	const sameSite =
		target.hostname.endsWith(".bilibili.com") && initiator.hostname.endsWith(".bilibili.com");
	const navigation =
		target.origin === "https://www.bilibili.com" && target.pathname === "/" && method === "GET";
	const major = identity.version.split(".")[0];
	const headers: Record<string, string> = {
		Accept: navigation
			? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
			: target.pathname === "/"
				? "*/*"
				: "application/json, text/plain, */*",
		"Accept-Language": identity.language,
		Referer: initiator.href,
		"Sec-Fetch-Site": navigation
			? "none"
			: target.origin === initiator.origin
				? "same-origin"
				: sameSite
					? "same-site"
					: "cross-site",
		"Sec-Fetch-Mode": navigation ? "navigate" : "cors",
		"Sec-Fetch-Dest": navigation ? "document" : "empty",
		Priority: navigation ? "u=0, i" : "u=1, i",
		...supplied,
	};
	if (!navigation && target.origin !== initiator.origin) headers.Origin = initiator.origin;
	if (navigation) headers["Sec-Fetch-User"] = "?1";
	if (identity.family === "safari") {
		headers["User-Agent"] =
			`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${identity.version} Safari/605.1.15`;
	} else {
		headers["User-Agent"] =
			`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36${identity.family === "edge" ? ` Edg/${major}.0.0.0` : ""}`;
		headers["sec-ch-ua"] =
			`"Not/A)Brand";v="8", "Chromium";v="${major}", "${identity.family === "edge" ? "Microsoft Edge" : "Google Chrome"}";v="${major}"`;
		headers["sec-ch-ua-mobile"] = "?0";
		headers["sec-ch-ua-platform"] = '"Windows"';
	}
	return headers;
}
