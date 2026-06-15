import type { PrismaClient } from "./types";

export type TxClient = Omit<
	PrismaClient,
	"$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends"
>;

export * from "./prisma";
export * from "./types";
