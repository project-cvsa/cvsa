import { env } from "@cvsa/env";
import { createDatabaseClient } from "./client";

export * from "./client";
export * from "./relations";
export * from "./schema";
export * from "./serialize";
export * from "./types";

/** Shared catalog client. */
export const db = createDatabaseClient({
	connectionString: env.DATABASE_URL,
});
