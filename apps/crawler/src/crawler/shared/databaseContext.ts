import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseClient, TxClient } from "@cvsa/snapshot-db";
import { assertTaskActive } from "./taskContext";

const transactions = new AsyncLocalStorage<{ db: DatabaseClient; tx: TxClient }>();

export function activeDatabase(db: DatabaseClient): DatabaseClient | TxClient {
	assertTaskActive();
	const current = transactions.getStore();
	return current?.db === db ? current.tx : db;
}

export function databaseTransaction<T>(db: DatabaseClient, work: () => Promise<T>): Promise<T> {
	return db.transaction((tx) => transactions.run({ db, tx }, work));
}
