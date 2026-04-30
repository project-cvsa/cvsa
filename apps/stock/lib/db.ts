import postgres from "postgres";
import type { Sql } from "postgres";

let sqlInstance: Sql | null = null;

export function getSql(): Sql {
	if (sqlInstance) return sqlInstance;

	const DATABASE_URL = process.env.DATABASE_URL;
	if (!DATABASE_URL) {
		throw new Error("DATABASE_URL environment variable is not set");
	}

	sqlInstance = postgres(DATABASE_URL, {
		max: 10,
		idle_timeout: 30,
		connect_timeout: 10,
	});

	return sqlInstance;
}
