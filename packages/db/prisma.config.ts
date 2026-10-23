import { existsSync } from "node:fs";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";

if (existsSync(envFile)) {
	process.loadEnvFile(envFile);
}

export default definePrismaConfig({
	orm: ormConfig({
		contract: "./prisma/contract.prisma",
		db: {
			connection: process.env.DATABASE_URL ?? "postgresql://localhost:5432/cvsa",
		},
		migrations: {
			dir: "prisma/migrations",
		},
	}),
});
