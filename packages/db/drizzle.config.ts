import { env } from "@cvsa/env";
import { defineConfig } from "drizzle-kit";

/**
 * Schema source of truth for the catalog database.
 *
 * The catalog lives in four PostgreSQL schemas (`core`, `meta`, `platform`,
 * `auth`). `schemaFilter` is what keeps `push` from treating every other schema
 * on the server as garbage to drop.
 */
export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./drizzle",
	dbCredentials: {
		url: env.DATABASE_URL,
	},
	schemaFilter: ["core", "meta", "platform", "auth"],
	verbose: true,
});
