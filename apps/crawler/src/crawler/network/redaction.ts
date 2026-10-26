import type { NetworkRuntimeConfig } from "@cvsa/network-scheduler";
import type { NetworkRuntimeConfigDocument } from "../dto";

/** Placeholder that replaces a proxy username or password on the way out. */
export const REDACTED_PROXY_CREDENTIAL = "***";

interface ProxyUrlSegments {
	/** Everything up to and including `://`, or the whole string without a scheme. */
	beforeUserinfo: string;
	/** `user:password`, or `undefined` when the authority carries no userinfo. */
	userinfo: string | undefined;
	/** The `@` that closes the userinfo plus the rest of the URL. */
	afterUserinfo: string;
}

/**
 * Splits a proxy URL around its userinfo without normalizing anything, so ports,
 * paths, and encodings survive a redact/restore round trip.
 */
function splitProxyUrl(proxyUrl: string): ProxyUrlSegments {
	const schemeSeparator = proxyUrl.indexOf("://");
	if (schemeSeparator === -1) {
		return { beforeUserinfo: proxyUrl, userinfo: undefined, afterUserinfo: "" };
	}

	const authorityStart = schemeSeparator + 3;
	const pathStart = proxyUrl.indexOf("/", authorityStart);
	const authorityEnd = pathStart === -1 ? proxyUrl.length : pathStart;
	const atIndex = proxyUrl.indexOf("@", authorityStart);

	if (atIndex === -1 || atIndex > authorityEnd) {
		return { beforeUserinfo: proxyUrl, userinfo: undefined, afterUserinfo: "" };
	}

	return {
		beforeUserinfo: proxyUrl.slice(0, authorityStart),
		userinfo: proxyUrl.slice(authorityStart, atIndex),
		afterUserinfo: proxyUrl.slice(atIndex),
	};
}

/**
 * Masks the userinfo portion of a proxy URL without touching anything else.
 * `http://user:secret@proxy.example.com:8080/path` becomes
 * `http://***:***@proxy.example.com:8080/path`, so operators can still identify
 * the exit while the credential itself never leaves the process.
 */
export function redactProxyUrl(proxyUrl: string): string {
	const { beforeUserinfo, userinfo, afterUserinfo } = splitProxyUrl(proxyUrl);
	if (userinfo === undefined) return proxyUrl;

	const redactedUserinfo = userinfo.includes(":")
		? `${REDACTED_PROXY_CREDENTIAL}:${REDACTED_PROXY_CREDENTIAL}`
		: REDACTED_PROXY_CREDENTIAL;

	return `${beforeUserinfo}${redactedUserinfo}${afterUserinfo}`;
}

/**
 * Whether a proxy URL carries the placeholder produced by `redactProxyUrl`.
 *
 * The match is exact (`***` or `***:***`) because the placeholder is
 * indistinguishable from a literal `***` password otherwise. A credential that is
 * literally `***` is therefore treated as redacted; use any other value.
 */
export function hasRedactedProxyCredentials(proxyUrl: string): boolean {
	const { userinfo } = splitProxyUrl(proxyUrl);
	return (
		userinfo === REDACTED_PROXY_CREDENTIAL ||
		userinfo === `${REDACTED_PROXY_CREDENTIAL}:${REDACTED_PROXY_CREDENTIAL}`
	);
}

/**
 * Replaces the placeholder userinfo in `redactedProxyUrl` with the userinfo from
 * `sourceProxyUrl`, keeping every other part of the submitted URL (host, port,
 * path). Returns `undefined` when there is no credential to restore.
 */
export function restoreProxyCredentials(
	redactedProxyUrl: string,
	sourceProxyUrl: string
): string | undefined {
	const target = splitProxyUrl(redactedProxyUrl);
	const source = splitProxyUrl(sourceProxyUrl);

	if (target.userinfo === undefined || source.userinfo === undefined) return undefined;
	if (source.userinfo === "") return undefined;

	return `${target.beforeUserinfo}${source.userinfo}${target.afterUserinfo}`;
}

/**
 * Returns a copy of the runtime configuration that is safe to return from an
 * API response or to write into a log line. Only `http-proxy` adapters can carry
 * credentials, so only their `proxyUrl` is rewritten.
 */
export function redactNetworkRuntimeConfig(config: NetworkRuntimeConfig): NetworkRuntimeConfig {
	return {
		...config,
		adapters: config.adapters.map((adapter) => {
			if (adapter.type === "http-proxy")
				return { ...adapter, proxyUrl: redactProxyUrl(adapter.proxyUrl) };
			else return adapter;
		}),
	};
}

export function redactNetworkRuntimeConfigDocument(
	document: NetworkRuntimeConfigDocument
): NetworkRuntimeConfigDocument {
	return { ...document, config: redactNetworkRuntimeConfig(document.config) };
}
