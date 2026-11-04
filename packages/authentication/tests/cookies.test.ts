import { describe, expect, it } from "bun:test";
import { SESSION_COOKIE_NAME, parseTokenFromCookie, parseTokenFromHeaders } from "../src/cookies";

describe("parseTokenFromCookie", () => {
	it("returns null for null, undefined, or empty cookie headers", () => {
		expect(parseTokenFromCookie(null)).toBeNull();
		expect(parseTokenFromCookie(undefined)).toBeNull();
		expect(parseTokenFromCookie("")).toBeNull();
	});

	it("extracts token from standard single cookie", () => {
		const token = "c63714a09f1baad076e81ba611a7784c2d762bacf693711ce90610f517d22c66";
		expect(parseTokenFromCookie(`${SESSION_COOKIE_NAME}=${token}`)).toBe(token);
	});

	it("extracts token surrounded by other cookies", () => {
		const token = "c63714a09f1baad076e81ba611a7784c2d762bacf693711ce90610f517d22c66";
		const header = `_ga=GA1.2.3; ${SESSION_COOKIE_NAME}=${token}; theme=dark; other=abc`;
		expect(parseTokenFromCookie(header)).toBe(token);
	});

	it("strips wrapping double quotes around cookie value", () => {
		const token = "c63714a09f1baad076e81ba611a7784c2d762bacf693711ce90610f517d22c66";
		expect(parseTokenFromCookie(`${SESSION_COOKIE_NAME}="${token}"`)).toBe(token);
	});

	it("ignores empty duplicate cookie and picks valid token", () => {
		const token = "c63714a09f1baad076e81ba611a7784c2d762bacf693711ce90610f517d22c66";
		const header = `${SESSION_COOKIE_NAME}=; ${SESSION_COOKIE_NAME}=${token}`;
		expect(parseTokenFromCookie(header)).toBe(token);
	});

	it("does not truncate on dots inside token value", () => {
		const token = "token.with.multiple.dots.123";
		expect(parseTokenFromCookie(`${SESSION_COOKIE_NAME}=${token}`)).toBe(token);
	});

	it("works with parseTokenFromHeaders with Headers or record", () => {
		const token = "c63714a09f1baad076e81ba611a7784c2d762bacf693711ce90610f517d22c66";
		const headers = new Headers();
		headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
		expect(parseTokenFromHeaders(headers)).toBe(token);

		expect(parseTokenFromHeaders({ cookie: `${SESSION_COOKIE_NAME}=${token}` })).toBe(token);
		expect(parseTokenFromHeaders({ authorization: `Bearer ${token}` })).toBe(token);
	});
});
