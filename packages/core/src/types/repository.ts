import type { TxClient } from "@cvsa/db";

export interface IRepositoryWithGetDetails<T> {
	getDetailsById(id: number | string, tx?: TxClient): Promise<T | null>;
}
