import { PrismaClient } from "@project-cvsa/db";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@lib/env";

const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });
