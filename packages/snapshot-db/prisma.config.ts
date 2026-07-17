import { defineConfig } from "prisma/config";

const snapshotDatabaseUrl =
	process.env.CRAWLER_SNAPSHOT_DATABASE_URL ??
	"postgres://cvsa:password@127.0.0.1:5433/cvsa_snapshot";

export default defineConfig({
	schema: "prisma/",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: snapshotDatabaseUrl,
	},
});
