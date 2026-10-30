import { SQL } from "bun";

/**
 * A schema push validates the connection before it applies anything, so it
 * fails outright when the target database has never been created. A freshly started docker-compose cluster only creates the
 * database named by `POSTGRES_DB`, which means the `*_test` databases do not
 * exist until someone creates them by hand. `ensureDatabase` closes that gap
 * for the `test:setup` / `test:reset` scripts, so CI and fresh machines never
 * depend on a pre-seeded volume or a docker entrypoint script.
 */

/** Postgres must be reachable before we can create anything. */
const CONNECT_ATTEMPTS = 30;
const CONNECT_RETRY_DELAY_MS = 1_000;

/** Connection-level failures that mean "Postgres is still booting". */
const RETRYABLE_CODES = new Set([
	"ERR_POSTGRES_CONNECTION_CLOSED",
	"ERR_POSTGRES_CONNECTION_REFUSED",
	"ERR_POSTGRES_CONNECTION_TIMEOUT",
	"ERR_POSTGRES_UNEXPECTED_MESSAGE",
	"57P03", // cannot_connect_now: the server is starting up
	"53300", // too_many_connections
]);

export interface EnsureDatabaseOptions {
	/** Connection string for the database that must exist. */
	connection: string;
	/** Extensions to install into it, e.g. `timescaledb`. */
	extensions?: readonly string[];
	/** Database used to run `CREATE DATABASE`. Defaults to `postgres`. */
	adminDatabase?: string;
}

export interface EnsureDatabaseResult {
	database: string;
	created: boolean;
	extensions: readonly string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Quotes an identifier so unusual database names cannot break the statement. */
function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

/** Reads the database name out of a connection string, or throws when absent. */
function readDatabaseName(connection: string): string {
	const { pathname } = new URL(connection);
	const database = decodeURIComponent(pathname.replace(/^\//, ""));

	if (database.length === 0) {
		throw new Error(`Connection string has no database name: ${connection}`);
	}

	return database;
}

/** True when the driver error describes an unavailable server, not a bad query. */
function isRetryable(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const { code } = error as { code?: string };

	if (typeof code === "string" && RETRYABLE_CODES.has(code)) {
		return true;
	}

	return /connection (refused|closed|timed out)|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(
		error.message
	);
}

/**
 * Creates `connection`'s database when missing, waiting for Postgres to accept
 * connections first. Safe to run repeatedly: an existing database is a no-op.
 */
export async function ensureDatabase(
	options: EnsureDatabaseOptions
): Promise<EnsureDatabaseResult> {
	const { connection, extensions = [], adminDatabase = "postgres" } = options;
	const database = readDatabaseName(connection);

	const admin = new URL(connection);
	admin.pathname = `/${encodeURIComponent(adminDatabase)}`;

	const adminSql = new SQL({ max: 1, url: admin.toString() });
	let created = false;

	try {
		for (let attempt = 1; ; attempt += 1) {
			try {
				await adminSql.unsafe("SELECT 1");
				break;
			} catch (error) {
				if (!isRetryable(error) || attempt >= CONNECT_ATTEMPTS) {
					throw error;
				}

				if (attempt === 1) {
					console.warn(`Waiting for ${admin.host} to accept connections...`);
				}

				await sleep(CONNECT_RETRY_DELAY_MS);
			}
		}

		const existing = await adminSql`
			SELECT 1 FROM pg_database WHERE datname = ${database}
		`;

		if (existing.length === 0) {
			await adminSql.unsafe(`CREATE DATABASE ${quoteIdentifier(database)}`);
			created = true;
			console.log(`Created database "${database}".`);
		}
	} finally {
		await adminSql.close();
	}

	if (extensions.length > 0) {
		const targetSql = new SQL({ max: 1, url: connection });

		try {
			for (const extension of extensions) {
				await targetSql.unsafe(
					`CREATE EXTENSION IF NOT EXISTS ${quoteIdentifier(extension)}`
				);
			}
		} finally {
			await targetSql.close();
		}
	}

	return { created, database, extensions };
}
