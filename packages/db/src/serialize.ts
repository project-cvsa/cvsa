import { Temporal } from "temporal-polyfill";

/**
 * Convert a domain row to its JSON-serializable API shape.
 *
 * Drizzle hands back `Temporal.Instant` for `timestamptz` and `bigint` for
 * `int8`; both are correct in the domain and both are unrepresentable in JSON.
 * The contract schemas expect ISO strings and numbers, so every response passes
 * through here exactly once, at the handler boundary.
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

export function serializeResult<T>(obj: T): Serialized<T> {
	if (obj instanceof Date || obj instanceof Temporal.Instant) {
		return obj.toString() as Serialized<T>;
	}

	if (typeof obj === "bigint") {
		return Number(obj) as Serialized<T>;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => serializeResult(item)) as Serialized<T>;
	}

	if (typeof obj === "object" && obj !== null) {
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(obj)) {
			result[key] = serializeResult(value);
		}

		return result as Serialized<T>;
	}

	return obj as Serialized<T>;
}
