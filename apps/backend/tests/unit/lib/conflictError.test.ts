import { describe, test, expect } from "bun:test";
import { ConflictError } from "@lib/error/conflict";

describe("ConflictError", () => {
	test("Has correct default value", () => {
		const err = new ConflictError("username");

		expect(err).toBeInstanceOf(Error);
		expect(err.code).toBe("APP_CONFLICT_ERROR");
		expect(err.statusCode).toBe(409);
		expect(err.meta).toEqual({ field: "username" });
		expect(err.message).toBe("Record already exists");
	});

	test("Can override code and message", () => {
		const err = new ConflictError("email", "EMAIL_DUPLICATED", "Email registered", 409);

		expect(err.code).toBe("EMAIL_DUPLICATED");
		expect(err.message).toBe("Email registered");
	});
});
