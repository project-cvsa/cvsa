import { describe, expect, spyOn, test } from "bun:test";
import { AppError } from "@cvsa/contracts";
import { callCrawlerApi } from "@/handlers/crawler/client";

describe("crawler control plane errors", () => {
	for (const [status, code, message] of [
		[404, "NOT_FOUND", "error.not-found"],
		[401, "CRAWLER_UNAVAILABLE", "error.crawler.unavailable"],
		[403, "CRAWLER_UNAVAILABLE", "error.crawler.unavailable"],
		[409, "ENTITY_CONFLICT", "error.crawler.conflict"],
		[429, "CRAWLER_RATE_LIMITED", "error.crawler.rate-limited"],
		[502, "CRAWLER_UNAVAILABLE", "error.crawler.unavailable"],
		[422, "CRAWLER_REQUEST_FAILED", "error.crawler.request-failed"],
	] as const) {
		test(`classifies upstream HTTP ${status}`, async () => {
			const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
				new Response("upstream detail", { status })
			);
			try {
				await callCrawlerApi("/test");
				throw new Error("Expected an error");
			} catch (error) {
				expect(AppError.isAppError(error)).toBe(true);
				if (!AppError.isAppError(error)) throw error;
				expect(error.code).toBe(code);
				expect(error.message).toBe(message);
				if (status === 401 || status === 403) expect(error.statusCode).toBe(502);
			} finally {
				fetchSpy.mockRestore();
			}
		});
	}
});
