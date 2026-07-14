import { describe, test, expect } from "vitest";
import { i18nMiddleware, getLocale } from "@lib/i18n/server";

const createMockRequest = (url: string, headers: Record<string, string> = {}): Request => {
    return new Request(url, {
        headers: new Headers(headers),
    });
};

describe("resolveHost()", () => {
    test("passes through valid language subdomain", () => {
        const req = createMockRequest("https://en.projectcvsa.com/about");
        expect(i18nMiddleware(req)).toEqual({ action: "next" });
    });

    test("redirects root domain to preferred language from header", () => {
        const req = createMockRequest("https://projectcvsa.com/about", {
            "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        });
        expect(i18nMiddleware(req)).toEqual({
            action: "redirect",
            target: "https://zh.projectcvsa.com/about",
        });
    });

    test("maintains dev flag during environment routing shifts", () => {
        const req = createMockRequest("https://dev.projectcvsa.com/about", {
            "accept-language": "zh-HK",
        });
        expect(i18nMiddleware(req)).toEqual({
            action: "redirect",
            target: "https://zh.dev.projectcvsa.com/about",
        });
    });

    test("returns null gracefully for unrecognized domains", () => {
        const req = createMockRequest("https://arbitrary-domain.com/path");
        expect(i18nMiddleware(req)).toBeNull();
    });
});

describe("getLocale()", () => {
    test("respect to preferred language from header", () => {
        const req1 = createMockRequest("https://zh.projectcvsa.com/", {
            "accept-language": "zh-TW",
        });
        const req2 = createMockRequest("https://zh.projectcvsa.com/", {
            "accept-language": "zh-CN",
        });
        expect(getLocale(req1)).toEqual({
            language: "zh-TW",
            baseLanguage: "zh",
        });
        expect(getLocale(req2)).toEqual({
            language: "zh-CN",
            baseLanguage: "zh",
        });
    });

    test("falls back to host language when accept-language is absent", () => {
        const req = createMockRequest("https://es.projectcvsa.com/home");
        expect(getLocale(req)).toEqual({
            language: "en-US",
            baseLanguage: "en",
        });
    });

    test("falls back to accept-language when host has no valid language", () => {
        const req = createMockRequest("https://projectcvsa.com/", {
            "accept-language": "zh-HK",
        });
        expect(getLocale(req)).toEqual({
            language: "zh-HK",
            baseLanguage: "zh",
        });
    });

    test("host language takes precedence over accept-language base mismatch", () => {
        const req = createMockRequest("https://en.projectcvsa.com/", {
            "accept-language": "zh-CN,zh;q=0.9",
        });
        expect(getLocale(req)).toEqual({
            language: "en-US",
            baseLanguage: "en",
        });
    });

    test("honors quality values in accept-language header", () => {
        const req = createMockRequest("https://zh.projectcvsa.com/", {
            "accept-language": "zh-TW;q=0.9,zh-CN;q=1.0",
        });
        expect(getLocale(req)).toEqual({
            language: "zh-CN",
            baseLanguage: "zh",
        });
    });

    test("picks first supported candidate when accept-language region is unsupported", () => {
        const req = createMockRequest("https://zh.projectcvsa.com/", {
            "accept-language": "zh-SG",
        });
        expect(getLocale(req)).toEqual({
            language: "zh-CN",
            baseLanguage: "zh",
        });
    });

    test("handles multiple accept-language entries matching different candidates", () => {
        const req = createMockRequest("https://zh.projectcvsa.com/", {
            "accept-language": "en-US;q=0.8,zh-HK;q=0.9,zh-CN;q=0.7",
        });
        expect(getLocale(req)).toEqual({
            language: "zh-HK",
            baseLanguage: "zh",
        });
    });

    test("is case-insensitive for header values", () => {
        const req = createMockRequest("https://zh.projectcvsa.com/", {
            "accept-language": "zh-tw",
        });
        expect(getLocale(req)).toEqual({
            language: "zh-TW",
            baseLanguage: "zh",
        });
    });
});
