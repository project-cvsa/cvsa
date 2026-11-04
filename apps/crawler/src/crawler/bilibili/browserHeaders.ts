import {
	BilibiliCredentialBundleSchema,
	type BrowserIdentityConfig,
	type BilibiliCredentialBundle,
} from "@cvsa/contracts";
import { HeaderGenerator } from "header-generator";

type BrowserHeaderProfile = {
	identity: BilibiliCredentialBundle["identity"];
	headers: Record<string, string>;
};

const generator = new HeaderGenerator({
	browsers: ["chrome", "edge", "safari"],
	devices: ["desktop"],
	operatingSystems: ["windows", "macos", "linux"],
	httpVersion: "2",
	locales: ["zh-CN", "zh", "en"],
	strict: true,
});

const CLIENT_HINT_HEADERS = ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"] as const;
const CLIENT_HINT_ATTEMPTS = 8;

function generateHeaders(family: BilibiliCredentialBundle["identity"]["family"]) {
	let headers = generator.getHeaders({ browsers: [family] });
	if (family === "safari") return headers;
	for (
		let attempt = 1;
		attempt < CLIENT_HINT_ATTEMPTS &&
		!CLIENT_HINT_HEADERS.every((name) => headers[name] !== undefined);
		attempt++
	) {
		headers = generator.getHeaders({ browsers: [family] });
	}
	return headers;
}

export function chooseBrowserHeaders(
	config: BrowserIdentityConfig,
	random: () => number = Math.random
): BrowserHeaderProfile {
	const families: BilibiliCredentialBundle["identity"]["family"][] = ["chrome", "edge", "safari"];
	const family =
		config.family === "auto"
			? (families[Math.min(families.length - 1, Math.floor(random() * families.length))] ??
				"chrome")
			: config.family;
	const headers = generateHeaders(family);
	const userAgent = headers["user-agent"] ?? headers["User-Agent"] ?? "";
	const versionPattern =
		family === "safari"
			? /Version\/([\d.]+)/
			: family === "edge"
				? /Edg\/([\d.]+)/
				: /Chrome\/([\d.]+)/;
	const identity = BilibiliCredentialBundleSchema.shape.identity.parse({
		family,
		version: userAgent.match(versionPattern)?.[1] ?? "1.0",
		language: config.language,
	});
	headers["accept-language"] = config.language;
	return { identity, headers };
}

export function browserRequestHeaders(
	profile: BrowserHeaderProfile,
	url: string,
	method = "GET",
	extra: Record<string, string> = {}
): Record<string, string> {
	const target = new URL(url);
	const supplied = Object.fromEntries(
		Object.entries(extra).map(([name, value]) => [name.toLowerCase(), value])
	);
	const initiator = new URL(supplied.origin ?? supplied.referer ?? "https://www.bilibili.com/");
	const biliSite = (hostname: string) =>
		hostname === "bilibili.com" || hostname.endsWith(".bilibili.com");
	const navigation =
		target.origin === "https://www.bilibili.com" && target.pathname === "/" && method === "GET";
	const headers: Record<string, string> = { ...supplied, ...profile.headers };
	for (const name of [
		"sec-fetch-site",
		"sec-fetch-mode",
		"sec-fetch-dest",
		"sec-fetch-user",
		"upgrade-insecure-requests",
		"te",
	])
		delete headers[name];
	headers.priority = navigation ? "u=0, i" : "u=1, i";
	if (navigation) {
		headers["sec-fetch-site"] = "none";
		headers["sec-fetch-mode"] = "navigate";
		headers["sec-fetch-dest"] = "document";
		headers["sec-fetch-user"] = "?1";
		headers["upgrade-insecure-requests"] = "1";
	} else {
		headers.accept = supplied.accept ?? "application/json, text/plain, */*";
		headers.referer = initiator.href;
		headers["sec-fetch-site"] =
			target.origin === initiator.origin
				? "same-origin"
				: biliSite(target.hostname) && biliSite(initiator.hostname)
					? "same-site"
					: "cross-site";
		headers["sec-fetch-mode"] = "cors";
		headers["sec-fetch-dest"] = "empty";
		if (target.origin !== initiator.origin || (method !== "GET" && method !== "HEAD"))
			headers.origin = initiator.origin;
	}
	return generator.orderHeaders(
		Object.fromEntries(
			Object.entries(headers).map(([name, value]) => [
				name.startsWith("sec-ch-")
					? name
					: name
							.split("-")
							.map((part) => part[0].toUpperCase() + part.slice(1))
							.join("-"),
				value,
			])
		)
	);
}
