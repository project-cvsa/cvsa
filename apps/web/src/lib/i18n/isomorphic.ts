import type { TranslateFunction } from "@fanee/core";
import { useT } from "@fanee/solid";

export const getComponentT = (namespace: string): TranslateFunction => {
	return useT({ namespace });
};
