import { AsyncLocalStorage } from "node:async_hooks";
import type { LogAttributes } from "./types";

export interface LogContextAttrs extends LogAttributes {
	jobId?: string | number;
	queue?: string;
	aid?: string | number | bigint;
	bvid?: string;
	worker?: string;
	component?: string;
	[key: string]: unknown;
}

const contextStorage = new AsyncLocalStorage<LogContextAttrs>();

export function getLogContext(): LogContextAttrs | undefined {
	return contextStorage.getStore();
}

export function withLogContext<T>(
	attrs: LogContextAttrs,
	fn: () => T | Promise<T>
): T | Promise<T> {
	const current = contextStorage.getStore() ?? {};
	return contextStorage.run({ ...current, ...attrs }, fn);
}
