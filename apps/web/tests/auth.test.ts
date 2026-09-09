import { beforeEach, describe, expect, test, vi } from "vitest";

// The @cvsa/core mock keeps the real module (better-auth, Prisma, DB) from
// ever loading; only the pieces @lib/auth consumes are provided.
vi.mock("@cvsa/core", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
	betterAuthToCurrentUserInfoDto: vi.fn(),
}));

import { auth, betterAuthToCurrentUserInfoDto, type CurrentUserInfoDto } from "@cvsa/core";
import { resolveCurrentAuth, resolveCurrentUser } from "@lib/auth/server";
import { ANONYMOUS_ONLY_ROUTES, AUTH_REQUIRED_ROUTES } from "@lib/auth/routes";
import { loginRedirectTarget } from "@lib/auth/guards";

// Types keep resolving to the real better-auth session even though the
// runtime module is mocked above.
type GetSessionResult = Exclude<Awaited<ReturnType<typeof auth.api.getSession>>, null>;

const getSessionMock = vi.mocked(auth.api.getSession);
const toDtoMock = vi.mocked(betterAuthToCurrentUserInfoDto);

const sessionUser: GetSessionResult["user"] = {
	id: "u123",
	name: "Alice",
	email: "alice@example.com",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-02T00:00:00.000Z"),
	username: "alice",
	displayUsername: "Alice",
	reputation: 0,
};

const session: GetSessionResult["session"] = {
	id: "s123",
	userId: "u123",
	token: "session-token",
	expiresAt: new Date("2026-04-01T00:00:00.000Z"),
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const mappedUser: CurrentUserInfoDto = {
	id: "u123",
	username: "alice",
	displayName: "Alice",
	email: "alice@example.com",
	createdAt: "2026-01-01T00:00:00.000Z",
	image: null,
};

const createRequest = (headers: Record<string, string>): Request => {
	return new Request("https://zh.projectcvsa.com/song/42", {
		headers: new Headers(headers),
	});
};

beforeEach(() => {
	getSessionMock.mockReset();
	toDtoMock.mockReset();
	toDtoMock.mockReturnValue(mappedUser);
});

describe("resolveCurrentAuth()", () => {
	test("skips the session lookup entirely without credential headers", async () => {
		const request = createRequest({ "accept-language": "zh" });

		const result = await resolveCurrentAuth(request);

		expect(result).toEqual({ user: null, session: null });
		expect(getSessionMock).not.toHaveBeenCalled();
		await expect(resolveCurrentUser(request)).resolves.toBeNull();
	});

	test("an authorization header alone still triggers the lookup", async () => {
		getSessionMock.mockResolvedValue(null);
		const request = createRequest({ authorization: "Bearer session-token" });

		await expect(resolveCurrentUser(request)).resolves.toBeNull();
		expect(getSessionMock).toHaveBeenCalledTimes(1);
	});

	test("maps an active session to the user DTO and exposes the raw session", async () => {
		getSessionMock.mockResolvedValue({ user: sessionUser, session });
		const request = createRequest({ cookie: "cvsa.session_token=session-token" });

		const result = await resolveCurrentAuth(request);

		expect(result.user).toEqual(mappedUser);
		expect(result.session).toEqual(session);
		expect(toDtoMock).toHaveBeenCalledWith(sessionUser);
		// Headers reach better-auth untouched so it resolves its own cookie name.
		expect(getSessionMock).toHaveBeenCalledWith({ headers: request.headers });
	});

	test("an unknown session cookie resolves to anonymous", async () => {
		getSessionMock.mockResolvedValue(null);
		const request = createRequest({ cookie: "cvsa.session_token=stale-token" });

		const result = await resolveCurrentAuth(request);

		expect(result).toEqual({ user: null, session: null });
		expect(toDtoMock).not.toHaveBeenCalled();
	});

	test("degrades to anonymous when the session lookup fails", async () => {
		getSessionMock.mockRejectedValue(new Error("database unreachable"));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const request = createRequest({ cookie: "cvsa.session_token=session-token" });

		const result = await resolveCurrentAuth(request);

		expect(result).toEqual({ user: null, session: null });
		expect(warnSpy).toHaveBeenCalledTimes(1);
		warnSpy.mockRestore();
	});
});

describe("route rule tables", () => {
	const matches = (routes: RegExp[], pathname: string): boolean =>
		routes.some((route) => route.test(pathname));

	test("AUTH_REQUIRED_ROUTES stays empty until protected pages register", () => {
		expect(AUTH_REQUIRED_ROUTES).toEqual([]);
	});

	test("anonymous-only covers exactly the login and register pages", () => {
		for (const path of ["/login", "/register"]) {
			expect(matches(ANONYMOUS_ONLY_ROUTES, path)).toBe(true);
		}
		for (const path of ["/", "/login/extra", "/register/", "/song/1", "/logout"]) {
			expect(matches(ANONYMOUS_ONLY_ROUTES, path)).toBe(false);
		}
	});
});

describe("loginRedirectTarget()", () => {
	test("encodes the requested path as the redirect parameter", () => {
		expect(loginRedirectTarget("/song/42", "")).toBe("/login?redirect=%2Fsong%2F42");
	});

	test("preserves the requested query string", () => {
		expect(loginRedirectTarget("/song/42", "?page=2")).toBe(
			"/login?redirect=%2Fsong%2F42%3Fpage%3D2"
		);
	});

	test("keeps protocol-relative prefixes encoded so the login page's same-site check stays in charge", () => {
		const target = loginRedirectTarget("//evil.example.com", "");
		expect(target.startsWith("/login?redirect=%2F%2F")).toBe(true);
	});
});
