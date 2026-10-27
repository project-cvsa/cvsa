import { env } from "@cvsa/env";
import { Temporal } from "temporal-polyfill";
import { createDatabaseClient } from "./client";

/**
 * Convert a type to a JSON-serializable version.
 * It will convert `bigint` to `number`,
 * and `Date` or `Temporal.Instant` to `string`
 */
export type Serialized<T> = T extends Date | Temporal.Instant
	? string
	: T extends bigint
		? number
		: T extends Array<infer U>
			? Array<Serialized<U>>
			: T extends object
				? { [K in keyof T]: Serialized<T[K]> }
				: T;

export function transformPrismaResult<T>(obj: T): Serialized<T> {
	if (obj instanceof Date || obj instanceof Temporal.Instant) {
		return obj.toString() as Serialized<T>;
	}

	if (typeof obj === "bigint") {
		return Number(obj) as Serialized<T>;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => transformPrismaResult(item)) as Serialized<T>;
	}

	if (typeof obj === "object" && obj !== null) {
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(obj)) {
			result[key] = transformPrismaResult(value);
		}

		return result as Serialized<T>;
	}

	return obj as Serialized<T>;
}

export const prisma = createDatabaseClient({
	connectionString:
		env.DATABASE_URL ?? (typeof process !== "undefined" ? process.env.DATABASE_URL : undefined),
});
