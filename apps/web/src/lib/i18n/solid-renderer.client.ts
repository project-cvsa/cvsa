import solidRenderer from "@astrojs/solid-js/client.js";
import {
	type ComponentTranslationFactory,
	type I18nSolidComponent,
	type I18nSolidProps,
	wrapComponentWithI18n,
} from "./component-context";
import { i18n } from "./client";

type ClientRenderOptions = {
	client: string;
};

const getT: ComponentTranslationFactory = (namespace) => {
	return i18n.getT({ namespace });
};

export default (element: HTMLElement) => {
	const render = solidRenderer(element);
	return (
		Component: I18nSolidComponent,
		props: I18nSolidProps,
		slotted: Record<string, string>,
		options: ClientRenderOptions
	) => {
		return render(wrapComponentWithI18n(Component, getT), props, slotted, options);
	};
};
