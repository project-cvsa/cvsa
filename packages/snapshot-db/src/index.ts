import { PrismaPg } from "@prisma/adapter-pg";
import { crawlerEnv } from "@cvsa/env";
import { PrismaClient } from "../prisma/generated/client";

export type { PrismaClient } from "../prisma/generated/client";
export type { VideoSnapshotModel as VideoSnapshot } from "../prisma/generated/models/VideoSnapshot";

export interface SnapshotDb {
	readonly client: PrismaClient;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	healthCheck(): Promise<void>;
}

export function createSnapshotDb(connectionString = crawlerEnv.CRAWLER_SNAPSHOT_DATABASE_URL): SnapshotDb {
	const adapter = new PrismaPg({ connectionString });
	const client = new PrismaClient({ adapter });

	return {
		client,
		connect: () => client.$connect(),
		disconnect: () => client.$disconnect(),
		healthCheck: async () => {
			await client.$queryRaw`SELECT 1`;
		},
	};
}

export const snapshotDb = createSnapshotDb();
