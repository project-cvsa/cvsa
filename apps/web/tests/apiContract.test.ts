import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, configureApiClient, type ApiErrorCode } from "@lib/api";

/**
 * Contract tests: they exist mainly for the compiler.
 *
 * `api.*` is typed by the backend's Eden contract, so the annotations and the
 * exhaustive switch below fail `bun typecheck` whenever a route, a payload or an
 * error code drifts. Extra members coming back from the backend are dropped at
 * runtime too, which the assertions at the end pin down.
 */

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

beforeEach(() => {
	configureApiClient({ baseUrl: "https://api.test" });
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Only declared payload members are reachable. */
function readLoginPayload(result: LoginResult): string | undefined {
	if (!result.ok || !result.data) {
		return undefined;
	}
	return result.data.data.token;
}

/** Error codes narrow to the backend's enum plus the client-only case. */
function readLoginErrorCode(result: LoginResult): ApiErrorCode | undefined {
	if (result.ok) {
		return undefined;
	}
	return result.error.code;
}

type LoginResult = Awaited<ReturnType<typeof api.auth.login>>;

/** True when the wrapper accepts the exact request DTO the backend declares. */
type AcceptsLoginBody<F> = F extends (body: { email: string; password: string }) => unknown
	? true
	: false;

/** A body with a wrong member type must not be accepted. */
type RejectsWrongLoginBody<F> = F extends (body: { email: number; password: string }) => unknown
	? false
	: true;

/** True when the song wrapper accepts the update DTO members the backend declares. */
type AcceptsSongUpdateBody<F> = F extends (
	id: number,
	body: { name?: string; duration?: number; publishedAt?: string }
) => unknown
	? true
	: false;

/** A song update with a wrong member type must not be accepted. */
type RejectsWrongSongUpdateBody<F> = F extends (id: number, body: { duration: string }) => unknown
	? false
	: true;

/** Every code the backend can answer with, plus the client-only network case. */
const EXPECTED_ERROR_CODES = [
	"NOT_FOUND",
	"VALIDATION_ERROR",
	"ENTITY_CONFLICT",
	"INVALID_CREDENTIALS",
	"AUTH_ERROR",
	"INTERNAL_SERVER_ERROR",
	"USERNAME_IS_ALREADY_TAKEN",
	"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
	"INVALID_EMAIL_OR_PASSWORD",
	"USER_NOT_FOUND",
	"EMAIL_NOT_VERIFIED",
	"UNAUTHORIZED",
	"NETWORK_ERROR",
] as const satisfies readonly ApiErrorCode[];

type AuthField = "identifier" | "username" | "email" | "password" | "form";

/** Form field an auth error belongs to; the switch is exhaustive by design. */
function errorField(code: ApiErrorCode): AuthField {
	switch (code) {
		case "INVALID_CREDENTIALS":
		case "INVALID_EMAIL_OR_PASSWORD":
		case "UNAUTHORIZED":
			return "identifier";
		case "USERNAME_IS_ALREADY_TAKEN":
			return "username";
		case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
			return "email";
		case "VALIDATION_ERROR":
			return "password";
		case "NOT_FOUND":
		case "ENTITY_CONFLICT":
		case "AUTH_ERROR":
		case "INTERNAL_SERVER_ERROR":
		case "USER_NOT_FOUND":
		case "EMAIL_NOT_VERIFIED":
		case "NETWORK_ERROR":
			return "form";
	}
}

const acceptsLoginBody: AcceptsLoginBody<typeof api.auth.login> = true;
const rejectsWrongLoginBody: RejectsWrongLoginBody<typeof api.auth.login> = true;
const acceptsSongUpdateBody: AcceptsSongUpdateBody<typeof api.song.update> = true;
const rejectsWrongSongUpdateBody: RejectsWrongSongUpdateBody<typeof api.song.update> = true;

describe("api contract", () => {
	test("request bodies are validated against the backend DTO", () => {
		expect(acceptsLoginBody).toBe(true);
		expect(rejectsWrongLoginBody).toBe(true);
		expect(acceptsSongUpdateBody).toBe(true);
		expect(rejectsWrongSongUpdateBody).toBe(true);
	});

	test("every expected error code maps to a form field", () => {
		for (const code of EXPECTED_ERROR_CODES) {
			expect(errorField(code)).toBeTypeOf("string");
		}
	});

	test("results carry the backend payload", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				message: "Successfully logged in",
				data: { id: "u1", username: "alice", token: "tok" },
			})
		);

		const result: LoginResult = await api.auth.login({ email: "a", password: "b" });

		expect(readLoginPayload(result)).toBe("tok");
		expect(readLoginErrorCode(result)).toBeUndefined();
	});

	test("declared error codes survive, undeclared ones are rejected", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(409, { code: "USERNAME_IS_ALREADY_TAKEN", message: "taken" })
		);

		const result = await api.auth.register({ username: "alice", password: "password123" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("USERNAME_IS_ALREADY_TAKEN");

		fetchMock.mockResolvedValue(jsonResponse(500, { code: "NOT_A_REAL_CODE" }));

		const unknown = await api.auth.login({ email: "a", password: "b" });
		expect(unknown.ok).toBe(false);
		if (unknown.ok) return;
		expect(unknown.error.code).toBe("INTERNAL_SERVER_ERROR");
	});
});
