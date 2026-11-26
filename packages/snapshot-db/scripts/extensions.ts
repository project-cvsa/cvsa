/**
 * Shared PostgreSQL extension relocation statements for `cvsa_snapshot`.
 *
 * Isolates `pg_stat_statements` and `pg_trgm` into the `extensions` schema so
 * `drizzle-kit`'s `schemaFilter: ["public"]` never drops extension views while
 * unqualified queries and `gin_trgm_ops` indexes resolve via `search_path`.
 */
export const EXTENSION_STATEMENTS = [
	'CREATE SCHEMA IF NOT EXISTS "extensions"',
	'GRANT USAGE ON SCHEMA "extensions" TO PUBLIC',
	`DO $$
	BEGIN
		IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
			ALTER EXTENSION "pg_stat_statements" SET SCHEMA "extensions";
		ELSE
			CREATE EXTENSION "pg_stat_statements" WITH SCHEMA "extensions";
		END IF;
		IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
			ALTER EXTENSION "pg_trgm" SET SCHEMA "extensions";
		ELSE
			CREATE EXTENSION "pg_trgm" WITH SCHEMA "extensions";
		END IF;
		EXECUTE format('ALTER DATABASE %I SET search_path TO "$user", public, extensions', current_database());
	END $$`,
] as const;
