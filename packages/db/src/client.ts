import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "../prisma/contract.d";
import contractJson from "../prisma/contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

export { and, or, not } from "@prisma/orm-postgres/orm-client";

export interface DatabaseClientOptions {
	connectionString?: string;
	url?: string;
}

export function createDatabaseClient(options?: DatabaseClientOptions | string) {
	const url = typeof options === "string" ? options : (options?.connectionString ?? options?.url);
	return postgres({
		contract,
		...(url ? { url } : {}),
	});
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
export type TxClient = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
export type PrismaClient = DatabaseClient;
