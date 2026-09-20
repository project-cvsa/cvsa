import { describe, expect, test } from "bun:test";
import {
	HEALTH_AFFECTING_NETWORK_ERROR_CODES,
	RETRYABLE_NETWORK_ERROR_CODES,
	type NetworkApplicationErrorContext,
} from "@cvsa/network-scheduler";
import {
	BILIBILI_BUSINESS_ERROR_CODES,
	BILIBILI_RISK_CONTROL_HTTP_STATUS,
	BILIBILI_THROTTLING_CODES,
	classifyBilibiliResponse,
	createBilibiliApplicationErrorClassifier,
	createCrawlerAdapterRegistry,
} from "../../src/modules/crawler/network";

function context(status: number, body: string): NetworkApplicationErrorContext {
	return { status, headers: {}, body };
}

function classify(status: number, body: string) {
	return classifyBilibiliResponse(context(status, body));
}

describe("classifyBilibiliResponse", () => {
	test("treats a successful envelope as no error", () => {
		expect(classify(200, '{"code":0,"message":"0","data":{"aid":1}}')).toBeUndefined();
	});

	test("accepts numeric string codes", () => {
		expect(classify(200, '{"code":"0"}')).toBeUndefined();
		expect(classify(200, '{"code":"-509"}')).toBe("APPLICATION_RATE_LIMIT");
	});

	test("ignores bodies that are not a JSON envelope", () => {
		expect(classify(200, "")).toBeUndefined();
		expect(classify(200, "<html>challenge</html>")).toBeUndefined();
		expect(classify(200, "[1,2,3]")).toBeUndefined();
		expect(classify(200, "null")).toBeUndefined();
		expect(classify(200, "{not json")).toBeUndefined();
		expect(classify(200, '{"data":{}}')).toBeUndefined();
	});

	test("maps throttling and risk control codes to a retryable application error", () => {
		for (const code of BILIBILI_THROTTLING_CODES) {
			expect(classify(200, `{"code":${code},"message":"blocked"}`)).toBe(
				"APPLICATION_RATE_LIMIT"
			);
		}
	});

	test("maps the HTTP 412 risk-control status to a retryable application error", () => {
		expect(classify(BILIBILI_RISK_CONTROL_HTTP_STATUS, "risk control")).toBe(
			"APPLICATION_RATE_LIMIT"
		);
	});

	test("maps business codes to a non-retryable application error", () => {
		for (const code of BILIBILI_BUSINESS_ERROR_CODES) {
			expect(classify(200, `{"code":${code},"message":"unavailable"}`)).toBe(
				"APPLICATION_ERROR"
			);
		}
	});

	test("takes the conservative default for an unknown failure code", () => {
		expect(classify(200, '{"code":-12345,"message":"unknown"}')).toBe("APPLICATION_ERROR");
	});

	test("leaves transport-level statuses to the transport", () => {
		for (const status of [400, 403, 404, 429, 500, 503]) {
			expect(classify(status, "not json")).toBeUndefined();
		}
	});
});

describe("classifier semantics", () => {
	test("throttling codes are retryable and affect adapter health", () => {
		const classifier = createBilibiliApplicationErrorClassifier();
		const errorCode = classifier(context(200, '{"code":-509}'));

		expect(errorCode).toBe("APPLICATION_RATE_LIMIT");
		expect(errorCode && RETRYABLE_NETWORK_ERROR_CODES.has(errorCode)).toBe(true);
		expect(errorCode && HEALTH_AFFECTING_NETWORK_ERROR_CODES.has(errorCode)).toBe(true);
	});

	test("business codes are neither retryable nor health affecting", () => {
		const classifier = createBilibiliApplicationErrorClassifier();
		const errorCode = classifier(context(200, '{"code":-404,"message":"啥都木有"}'));

		expect(errorCode).toBe("APPLICATION_ERROR");
		expect(errorCode && RETRYABLE_NETWORK_ERROR_CODES.has(errorCode)).toBe(false);
		expect(errorCode && HEALTH_AFFECTING_NETWORK_ERROR_CODES.has(errorCode)).toBe(false);
	});
});

describe("createCrawlerAdapterRegistry", () => {
	test("creates configured adapters", () => {
		const registry = createCrawlerAdapterRegistry();
		const adapter = registry.create({
			id: "proxy-a",
			type: "http-proxy",
			proxyUrl: "http://user:secret@127.0.0.1:8080",
			enabled: true,
			baseWeight: 1,
			rateLimits: [],
		});

		expect(adapter.id).toBe("proxy-a");
	});
});
