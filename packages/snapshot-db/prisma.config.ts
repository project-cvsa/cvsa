import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { crawlerEnv } from "@cvsa/env";

export default definePrismaConfig({
	orm: ormConfig({
		contract: "./prisma/contract.prisma",
		db: {
			connection: crawlerEnv.SNAPSHOT_DATABASE_URL,
		},
		migrations: {
			dir: "prisma/migrations",
		},
	}),
});
