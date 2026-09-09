import type { TranslateFunction } from "@fanee/core";
import {
	type Component,
	createComponent,
	createContext,
	type ParentProps,
	useContext,
} from "solid-js";

export type ComponentTranslationFactory = (namespace: string) => TranslateFunction;
export type I18nSolidProps = Record<string, unknown>;
export type I18nSolidComponent = Component<I18nSolidProps>;

const ComponentI18nContext = createContext<ComponentTranslationFactory>();

export function ComponentI18nProvider(props: ParentProps<{ getT: ComponentTranslationFactory }>) {
	return (
		<ComponentI18nContext.Provider value={props.getT}>
			{props.children}
		</ComponentI18nContext.Provider>
	);
}

export const useComponentTranslationFactory = (): ComponentTranslationFactory => {
	const getT = useContext(ComponentI18nContext);
	if (!getT) {
		throw new Error("A Solid component requested i18n outside the Astro Solid renderer.");
	}
	return getT;
};

export const wrapComponentWithI18n = (
	Component: I18nSolidComponent,
	getT: ComponentTranslationFactory
): I18nSolidComponent => {
	return (props) =>
		createComponent(ComponentI18nProvider, {
			getT,
			get children() {
				return createComponent(Component, props);
			},
		});
};
