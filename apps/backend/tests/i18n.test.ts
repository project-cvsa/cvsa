import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { treaty } from "@elysiajs/eden";
import { i18nRuntime } from "../src/common/i18n";
import { i18nMiddleware } from "../src/middlewares/i18n";
import { getErrorResponse } from "../src/common/error/getErrorResponse";

describe("localized API responses", () => {
	test.each([
		{ headers: { "x-locale": "zh-CN" }, expected: "未登录" },
		{ headers: { "x-locale": "zh-TW" }, expected: "未登录" },
		{ headers: { "x-locale": "en-US" }, expected: "Unauthorized" },
		{ headers: { "accept-language": "en;q=0.2,zh-HK;q=0.9" }, expected: "未登录" },
		{ headers: { "accept-language": "zh;q=0,en;q=1" }, expected: "Unauthorized" },
		{ headers: { "x-locale": "en-US", "accept-language": "zh-CN" }, expected: "Unauthorized" },
	])("returns $expected for $headers", async ({ headers, expected }) => {
		const app = new Elysia()
			.use(i18nMiddleware)
			.get("/message", ({ locale }) => i18nRuntime.getT({ locale })("error.unauthorized"));
		const response = await treaty(app).message.get({ headers });
		expect(response.data).toBe(expected);
	});

	test("returns translations for every backend locale when no locale was selected", () => {
		const response = getErrorResponse((status, body) => ({ status, body }), 401, undefined, {
			code: "UNAUTHORIZED",
			message: "error.unauthorized",
		});
		expect(response.status).toBe(401);
		expect(response.body.i18n).toEqual({ en: "Unauthorized", zh: "未登录" });
	});
});
