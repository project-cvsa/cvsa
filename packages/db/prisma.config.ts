import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { loadDatabaseUrl } from "./src/databaseUrl";

export default definePrismaConfig({
	orm: ormConfig({
		contract: "./prisma/contract.prisma",
		db: {
			connection: loadDatabaseUrl(),
		},
		migrations: {
			dir: "prisma/migrations",
		},
	}),
});
