import { sql } from "drizzle-orm";
import { crawlerEnv } from "@cvsa/env";
import { createDatabaseClient, type DatabaseClient } from "./client";

export * from "./client";
export * from "./customTypes";
export * from "./schema";
export * from "./types";

export interface SnapshotDb {
	readonly client: DatabaseClient;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	healthCheck(): Promise<void>;
}

export function createSnapshotDb(connectionString = crawlerEnv.SNAPSHOT_DATABASE_URL): SnapshotDb {
	const client = createDatabaseClient({ connectionString });

	return {
		client,
		// Bun's SQL client connects lazily; round-tripping one trivial statement
		// is what turns "the pool exists" into "the database answered".
		connect: async () => {
			await client.execute(sql`SELECT 1`);
		},
		disconnect: async () => {
			await client.$client.close();
		},
		healthCheck: async () => {
			await client.execute(sql`SELECT 1`);
		},
	};
}

export const snapshotDb = createSnapshotDb();
