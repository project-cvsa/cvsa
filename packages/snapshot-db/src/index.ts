import { crawlerEnv } from "@cvsa/env";
import { createDatabaseClient, type DatabaseClient } from "./client";

export * from "./client";
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
		connect: async () => {
			await client.connect({ url: connectionString });
		},
		disconnect: async () => {
			await client.close();
		},
		healthCheck: async () => {
			await client.raw.sql`SELECT 1`;
		},
	};
}

export const snapshotDb = createSnapshotDb();
