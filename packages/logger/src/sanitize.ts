/**
 * Credential scrubbing for structured logs.
 *
 * `pino`'s `redact` option only understands explicit key paths, so it misses
 * deeply nested values and it never inspects message strings. Those are exactly
 * the shapes this codebase produces (`{ adapter: { proxyUrl } }`,
 * `` `Connecting to redis at ${REDIS_URL}` ``), so attributes and messages are
 * scrubbed before they reach any sink — pino, OpenTelemetry log records, and
 * span events alike.
 */

export const REDACTED_LOG_VALUE = "[REDACTED]";

/** Maximum object depth walked before a nested value is passed through untouched. */
const MAX_SANITIZE_DEPTH = 6;

/**
 * Key fragments that mark a value as a credential. Matching is done on the
 * normalized key (lowercase, alphanumerics only) so `proxy_url`, `proxyUrl`, and
 * `PROXY-URL` all match. It deliberately over-matches: hiding a harmless field is
 * cheaper than leaking a secret.
 */
const CREDENTIAL_KEY_FRAGMENTS = [
	"password",
	"passwd",
	"secret",
	"token",
	"credential",
	"apikey",
	"privatekey",
	"authorization",
	"cookie",
	"proxyurl",
	"sessionid",
];

/** `scheme://userinfo@host` inside a free-form string, e.g. a log message. */
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^/?#@\s]+)@/gi;

function normalizeKey(key: string): string {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCredentialKey(key: string): boolean {
	const normalized = normalizeKey(key);
	if (
		normalized === "credentialagesec" ||
		normalized === "sessiongen" ||
		normalized === "buvidprefix"
	) {
		return false;
	}
	return CREDENTIAL_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Masks the userinfo segment of every `scheme://user:password@host` occurrence in
 * a string while leaving URLs without credentials readable.
 */
export function sanitizeLogMessage(message: string): string {
	return message.replace(URL_CREDENTIAL_PATTERN, "$1***:***@");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function sanitizeLogValue(value: unknown, depth: number): unknown {
	if (typeof value === "string") return sanitizeLogMessage(value);
	if (depth >= MAX_SANITIZE_DEPTH) return value;
	if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, depth + 1));
	if (isPlainObject(value)) {
		const sanitized: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			sanitized[key] = isCredentialKey(key)
				? REDACTED_LOG_VALUE
				: sanitizeLogValue(nested, depth + 1);
		}
		return sanitized;
	}
	// Errors, Dates, and class instances are returned untouched so their
	// serializers keep working.
	return value;
}

/**
 * Returns a credential-free copy of log attributes. Plain objects and arrays are
 * copied; every other value (notably `Error`) keeps its identity.
 */
export function sanitizeLogAttributes(
	attributes: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
	if (!attributes) return attributes;
	const sanitized = sanitizeLogValue(attributes, 0);
	return isPlainObject(sanitized) ? sanitized : attributes;
}
