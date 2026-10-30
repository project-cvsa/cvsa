import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The four PostgreSQL schemas the catalog is partitioned into.
 *
 * Keeping them in one module avoids a web of schema-file imports: every table
 * module depends only on this file, never on a sibling table module.
 */
export const core = pgSchema("core");
export const meta = pgSchema("meta");
export const platform = pgSchema("platform");
export const auth = pgSchema("auth");
