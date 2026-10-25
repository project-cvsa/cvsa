import { beforeEach, describe, expect, test, vi } from "vitest";

// The @cvsa/authentication mock keeps the real module (better-auth, Prisma, DB) from
// ever loading; only the pieces @lib/auth consumes are provided.
vi.mock("@cvsa/authentication", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
	betterAuthToCurrentUserInfoDto: vi.fn(),
	getRoleNameById: vi.fn(),
}));

import {
	auth,
	betterAuthToCurrentUserInfoDto,
	getRoleNameById,
	type CurrentUserInfoDto,
} from "@cvsa/authentication";
import { resolveCurrentAuth, resolveCurrentUser } from "@lib/auth/server";
import { ADMIN_REQUIRED_ROUTES, ANONYMOUS_ONLY_ROUTES, AUTH_REQUIRED_ROUTES } from "@lib/auth/routes";
import { loginRedirectTarget, requireAdmin } from "@lib/auth/guards";

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
	roleId: null,
	roleName: null,
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
		expect(toDtoMock).toHaveBeenCalledWith(sessionUser, null);
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

	test("AUTH_REQUIRED_ROUTES covers the song edit page only", () => {
		expect(matches(AUTH_REQUIRED_ROUTES, "/song/12/edit")).toBe(true);
		for (const path of [
			"/song/12",
			"/song/12/",
			"/song/12/edit/extra",
			"/song/abc/edit",
			"/login",
		]) {
			expect(matches(AUTH_REQUIRED_ROUTES, path)).toBe(false);
		}
	});

	test("anonymous-only covers exactly the login and register pages", () => {
		for (const path of ["/login", "/register"]) {
			expect(matches(ANONYMOUS_ONLY_ROUTES, path)).toBe(true);
		}
		for (const path of ["/", "/login/extra", "/register/", "/song/1", "/logout"]) {
			expect(matches(ANONYMOUS_ONLY_ROUTES, path)).toBe(false);
		}
	});

	test("ADMIN_REQUIRED_ROUTES covers admin pages", () => {
		expect(matches(ADMIN_REQUIRED_ROUTES, "/admin")).toBe(true);
		expect(matches(ADMIN_REQUIRED_ROUTES, "/admin/crawler")).toBe(true);
		expect(matches(ADMIN_REQUIRED_ROUTES, "/admin/crawler/settings")).toBe(true);
		expect(matches(ADMIN_REQUIRED_ROUTES, "/song/12")).toBe(false);
		expect(matches(ADMIN_REQUIRED_ROUTES, "/login")).toBe(false);
	});
});

describe("requireAdmin()", () => {
	const mockContext = (pathname: string) =>
		({
			url: new URL(`https://example.com${pathname}`),
			redirect: vi.fn((target: string, status?: number) => new Response(null, { status: status ?? 302, headers: { Location: target } })),
		}) as unknown as Parameters<typeof requireAdmin>[0];

	test("redirects anonymous visitor to login", () => {
		const ctx = mockContext("/admin/crawler");
		const res = requireAdmin(ctx, null);
		expect(res?.status).toBe(302);
		expect(ctx.redirect).toHaveBeenCalledWith("/login?redirect=%2Fadmin%2Fcrawler", 302);
	});

	test("redirects non-admin user to 403", () => {
		const ctx = mockContext("/admin/crawler");
		const regularUser: CurrentUserInfoDto = {
			...mappedUser,
			roleName: "user",
		};
		const res = requireAdmin(ctx, regularUser);
		expect(res?.status).toBe(302);
		expect(ctx.redirect).toHaveBeenCalledWith("/403", 302);
	});

	test("allows OWNER user", () => {
		const ctx = mockContext("/admin/crawler");
		const ownerUser: CurrentUserInfoDto = {
			...mappedUser,
			roleName: "OWNER",
		};
		const res = requireAdmin(ctx, ownerUser);
		expect(res).toBeNull();
	});

	test("allows admin user", () => {
		const ctx = mockContext("/admin/crawler");
		const adminUser: CurrentUserInfoDto = {
			...mappedUser,
			roleName: "admin",
		};
		const res = requireAdmin(ctx, adminUser);
		expect(res).toBeNull();
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
