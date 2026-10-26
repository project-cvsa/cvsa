import type { TranslateFunction } from "@fanee/core";
import { useComponentTranslationFactory } from "./component-context";

export const getComponentT = (namespace: string): TranslateFunction => {
	return useComponentTranslationFactory()(namespace);
};
