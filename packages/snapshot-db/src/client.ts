import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

export interface DatabaseClientOptions {
	connectionString?: string;
	url?: string;
	beforeQuery?: () => void;
}

/**
 * Drizzle client bound to Bun's native Postgres driver.
 *
 * `bun-sql` speaks the wire protocol directly, so there is no `pg` pool, no
 * native addon and no code generation step between the schema and the runtime.
 *
 * The crawler tables have no relations — `video_snapshot` and friends are looked
 * up by primary key — so the client is created without a relational config and
 * every read is an explicit `select().from(...)`.
 */
export function createDatabaseClient(options?: DatabaseClientOptions | string) {
	const url = typeof options === "string" ? options : (options?.connectionString ?? options?.url);
	// Bun returns `int8` as a string unless `bigint` is set at construction time.
	// Drizzle flips `client.options.bigint` after the fact, which Bun ignores, so
	// every AID would arrive as "900000000000001" instead of a bigint.
	const client = new SQL({ ...(url ? { url } : {}), bigint: true });

	const beforeQuery = typeof options === "object" ? options.beforeQuery : undefined;
	return Object.assign(
		drizzle({ client, ...(beforeQuery ? { logger: { logQuery: () => beforeQuery() } } : {}) }),
		{ schema }
	);
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
export type TxClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
