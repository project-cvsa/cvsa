import { describe, expect, test } from "bun:test";
import {
	LOG_REDACT_PATHS,
	REDACTED_LOG_VALUE,
	isCredentialKey,
	sanitizeLogAttributes,
	sanitizeLogMessage,
} from "../src";

describe("sanitizeLogMessage", () => {
	test("masks credentials embedded in a message", () => {
		expect(sanitizeLogMessage("Connecting to redis at redis://:hunter2@127.0.0.1:6379")).toBe(
			"Connecting to redis at redis://***:***@127.0.0.1:6379"
		);
	});

	test("masks every credential in a message", () => {
		expect(sanitizeLogMessage("proxy http://bob:hunter2@a:1 and http://alice:secret@b:2")).toBe(
			"proxy http://***:***@a:1 and http://***:***@b:2"
		);
	});

	test("handles the proxy schemes the crawler uses", () => {
		expect(sanitizeLogMessage("https://bob:hunter2@proxy.example.com:8443/path")).toBe(
			"https://***:***@proxy.example.com:8443/path"
		);
	});

	test("leaves URLs without credentials readable", () => {
		for (const message of [
			"Connecting to redis at redis://127.0.0.1:6379",
			"Fetched https://api.bilibili.com/x/web-interface/view",
			"Network request completed",
		]) {
			expect(sanitizeLogMessage(message)).toBe(message);
		}
	});

	test("does not treat an email address as a URL credential", () => {
		expect(sanitizeLogMessage("owner mail is bob@example.com")).toBe(
			"owner mail is bob@example.com"
		);
	});
});

describe("isCredentialKey", () => {
	test("matches credential-shaped keys regardless of case and separators", () => {
		for (const key of [
			"password",
			"PASSWORD",
			"passwordHash",
			"proxyUrl",
			"proxy_url",
			"PROXY-URL",
			"apiKey",
			"api_key",
			"authorization",
			"refreshToken",
			"privateKey",
			"credentials",
			"cookie",
		]) {
			expect(isCredentialKey(key)).toBe(true);
		}
	});

	test("does not match the field names this codebase logs", () => {
		for (const key of [
			"component",
			"adapterId",
			"adapterIds",
			"requestType",
			"errorCode",
			"durationMs",
			"attempts",
			"revision",
			"jobId",
			"signal",
			"trace_id",
			"span_id",
			"path",
			"status",
			"latency",
			"userAgent",
			"ip",
			"reason",
		]) {
			expect(isCredentialKey(key)).toBe(false);
		}
	});
});

describe("sanitizeLogAttributes", () => {
	test("redacts credential values by key at any depth", () => {
		const sanitized = sanitizeLogAttributes({
			component: "network-config",
			adapter: { id: "proxy-a", proxyUrl: "http://bob:hunter2@proxy.example.com:8080" },
			headers: { authorization: "Bearer secret" },
		});

		expect(sanitized).toEqual({
			component: "network-config",
			adapter: { id: "proxy-a", proxyUrl: REDACTED_LOG_VALUE },
			headers: { authorization: REDACTED_LOG_VALUE },
		});
	});

	test("redacts credentials inside arrays", () => {
		const sanitized = sanitizeLogAttributes({
			adapters: [{ id: "proxy-a", proxyUrl: "http://bob:hunter2@h:8080" }],
		});

		expect(sanitized).toEqual({
			adapters: [{ id: "proxy-a", proxyUrl: REDACTED_LOG_VALUE }],
		});
	});

	test("scrubs credentials that appear in free-form string values", () => {
		const sanitized = sanitizeLogAttributes({
			component: "outbox",
			endpoint: "redis://:hunter2@127.0.0.1:6379",
		});

		expect(sanitized).toEqual({
			component: "outbox",
			endpoint: "redis://***:***@127.0.0.1:6379",
		});
	});

	test("keeps non-plain objects, such as errors, untouched", () => {
		const error = new Error("boom");
		const sanitized = sanitizeLogAttributes({ component: "x", error });

		expect(sanitized?.error).toBe(error);
	});

	test("does not mutate the input", () => {
		const attributes = {
			adapter: { proxyUrl: "http://bob:hunter2@h:8080" },
		};

		sanitizeLogAttributes(attributes);

		expect(attributes.adapter.proxyUrl).toBe("http://bob:hunter2@h:8080");
	});

	test("passes undefined through", () => {
		expect(sanitizeLogAttributes(undefined)).toBeUndefined();
	});

	test("never leaves a credential in the serialized result", () => {
		const serialized = JSON.stringify(
			sanitizeLogAttributes({
				adapter: {
					proxyUrl: "http://bob:hunter2@proxy.example.com:8080",
					password: "hunter2",
					note: "redis://:hunter2@127.0.0.1:6379",
				},
			})
		);

		expect(serialized).not.toContain("hunter2");
	});
});

describe("LOG_REDACT_PATHS", () => {
	test("covers the credential keys at the depths the crawler logs them", () => {
		expect(LOG_REDACT_PATHS).toContain("password");
		expect(LOG_REDACT_PATHS).toContain("*.proxyUrl");
		expect(LOG_REDACT_PATHS).toContain("*.*.proxyUrl");
		expect(LOG_REDACT_PATHS).toContain("config.adapters[*].proxyUrl");
	});

	test("does not contain duplicate paths", () => {
		expect(new Set(LOG_REDACT_PATHS).size).toBe(LOG_REDACT_PATHS.length);
	});
});
