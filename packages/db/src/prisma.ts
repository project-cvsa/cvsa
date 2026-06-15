import { PrismaClient } from "./types";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@cvsa/env";

const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,
});

/**
 * Convert an type to a JSON-serializable version.
 * It will convert `bigint` to `number`,
 * and `Date` to `string`
 */
export type Serialized<T> = T extends Date
	? string
	: T extends bigint
		? number
		: T extends Array<infer U>
			? Array<Serialized<U>>
			: T extends object
				? { [K in keyof T]: Serialized<T[K]> }
				: T;

export function transformPrismaResult<T>(obj: T): Serialized<T> {
	if (obj instanceof Date) {
		return obj.toISOString() as Serialized<T>;
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

export const prisma = new PrismaClient({
	adapter,
	log: [
		{ level: "query", emit: "event" },
		{ level: "info", emit: "stdout" },
		{ level: "warn", emit: "stdout" },
		{ level: "error", emit: "stdout" },
	],
});
