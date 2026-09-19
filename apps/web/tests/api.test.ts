import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, configureApiClient } from "@lib/api";

/**
 * Exercises the Eden transport without a server: `fetch` is stubbed, so these
 * tests assert the request the client actually emits (URL, method, headers,
 * credentials) and how it normalizes each kind of response.
 */
const fetchMock = vi.fn<typeof fetch>();

const jsonHeaders = { "content-type": "application/json" };

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });

/**
 * The request Eden issued, normalized to a `Request`.
 *
 * Eden calls `fetch` with a `Request`, but the tests accept a URL string plus an
 * init as well so they document and pin the transport contract rather than one
 * internal calling convention.
 */
const lastRequest = (): Request => {
	const call = fetchMock.mock.calls.at(-1);
	if (!call) {
		throw new Error("no request was issued");
	}
	const [input, init] = call;
	if (input instanceof Request) {
		return input;
	}
	return new Request(input, init);
};

const requestHeaders = (request: Request): Record<string, string> =>
	Object.fromEntries(request.headers.entries());

beforeEach(() => {
	configureApiClient({ baseUrl: "https://api.test" });
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal("document", { documentElement: { lang: "zh-CN" } });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("api.auth.login", () => {
	test("posts credentials with cookies and locale, and returns the payload", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				message: "Successfully logged in",
				data: { id: "u1", username: "alice", token: "tok" },
			})
		);

		const result = await api.auth.login({ email: "alice", password: "password123" });

		const request = lastRequest();
		expect(request.method).toBe("POST");
		expect(request.url).toBe("https://api.test/v2/session");
		expect(request.credentials).toBe("include");
		expect(requestHeaders(request)["x-locale"]).toBe("zh-CN");
		expect(result).toEqual({
			ok: true,
			status: 200,
			data: {
				message: "Successfully logged in",
				data: { id: "u1", username: "alice", token: "tok" },
			},
		});
	});

	test("surfaces the backend error envelope on 401", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(
				401,
				{ code: "INVALID_CREDENTIALS", message: "error.invalid-cred" },
				{ "x-trace-id": "trace-1" }
			)
		);

		const result = await api.auth.login({ email: "alice", password: "nope" });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(401);
		expect(result.error).toEqual({
			code: "INVALID_CREDENTIALS",
			message: "error.invalid-cred",
			traceId: "trace-1",
		});
	});
});

describe("api.auth.register", () => {
	test("returns a mapable conflict code", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(409, {
				code: "USERNAME_IS_ALREADY_TAKEN",
				message: "error.username-taken",
			})
		);

		const result = await api.auth.register({ username: "alice", password: "password123" });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("USERNAME_IS_ALREADY_TAKEN");
		expect(lastRequest().url).toBe("https://api.test/v2/user");
	});
});

describe("api.auth.logout", () => {
	test("sends no body and settles an empty 204 as success", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

		const result = await api.auth.logout();

		const request = lastRequest();
		expect(request.method).toBe("DELETE");
		expect(request.url).toBe("https://api.test/v2/session");
		expect(request.headers.has("content-type")).toBe(false);
		expect(result.ok).toBe(true);
	});
});

describe("api.song.update", () => {
	test("patches the song with cookies and locale, and returns the payload", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { id: 7, name: "Updated Name" }));

		const result = await api.song.update(7, { name: "Updated Name", duration: 214 });

		const request = lastRequest();
		expect(request.method).toBe("PATCH");
		expect(request.url).toBe("https://api.test/v2/song/7");
		expect(request.credentials).toBe("include");
		expect(requestHeaders(request)["x-locale"]).toBe("zh-CN");
		await expect(request.json()).resolves.toEqual({ name: "Updated Name", duration: 214 });
		expect(result.ok).toBe(true);
	});

	test("surfaces the backend envelope when the session is gone", async () => {
		fetchMock.mockResolvedValue(jsonResponse(401, { code: "UNAUTHORIZED", message: "未登录" }));

		const result = await api.song.update(7, { name: "Updated Name" });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("UNAUTHORIZED");
		expect(result.error.message).toBe("未登录");
	});
});

describe("failure normalization", () => {
	test("maps a thrown fetch to NETWORK_ERROR", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

		const result = await api.auth.currentUser();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("NETWORK_ERROR");
	});

	test("keeps an unrecognizable error body opaque", async () => {
		fetchMock.mockResolvedValue(
			new Response("<html>gateway</html>", {
				status: 502,
				headers: { "content-type": "text/html" },
			})
		);

		const result = await api.auth.currentUser();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(result.error.message).toBeUndefined();
	});
});
