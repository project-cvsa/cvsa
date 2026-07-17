import { defineConfig } from "prisma/config";
import { crawlerEnv } from "@cvsa/env";

export default defineConfig({
	schema: "prisma/",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: crawlerEnv.SNAPSHOT_DATABASE_URL,
	},
});
