import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { relations } from "./relations";

export interface DatabaseClientOptions {
	connectionString?: string;
	url?: string;
	max?: number;
	idleTimeout?: number;
	maxLifetime?: number;
}

/**
 * Drizzle client bound to Bun's native Postgres driver.
 *
 * `bigint` has to be set at construction: Bun ignores the post-construction
 * `options.bigint` mutation Drizzle performs, and without it every `int8`
 * column (song ids, Bilibili aids) arrives as a string.
 */
export function createDatabaseClient(options?: DatabaseClientOptions | string) {
	const opts = typeof options === "object" && options !== null ? options : undefined;
	const url = typeof options === "string" ? options : (opts?.connectionString ?? opts?.url);
	const client = new SQL({
		...(url ? { url } : {}),
		bigint: true,
		max: opts?.max ?? 10,
		idleTimeout: opts?.idleTimeout ?? 60,
		maxLifetime: opts?.maxLifetime ?? 1800,
	});

	return drizzle({ client, relations });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
export type TxClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
