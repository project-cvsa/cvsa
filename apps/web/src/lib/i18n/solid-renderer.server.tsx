import solidRenderer from "@astrojs/solid-js/server.js";
import type { AstroComponentMetadata, NamedSSRLoadedRendererValue } from "astro";
import {
	type ComponentTranslationFactory,
	type I18nSolidComponent,
	type I18nSolidProps,
	wrapComponentWithI18n,
} from "./component-context";
import { getLocale, i18nServer } from "./server";

type RendererContext = {
	result: {
		request: Request;
	};
};

const createRequestTranslationFactory = (locale: string): ComponentTranslationFactory => {
	const getT: ComponentTranslationFactory = (namespace) => {
		return i18nServer.getT({
			locale,
			namespace: `client:${namespace}`,
		});
	};
	return getT;
};

const renderer: NamedSSRLoadedRendererValue = {
	name: "@cvsa/solid-i18n",
	async check(
		this: RendererContext,
		Component: I18nSolidComponent,
		props: I18nSolidProps,
		children: Record<string, string>,
		metadata?: AstroComponentMetadata
	) {
		const { language } = getLocale(this.result.request);
		return solidRenderer.check.call(
			this,
			wrapComponentWithI18n(Component, createRequestTranslationFactory(language)),
			props,
			children,
			metadata
		);
	},
	async renderToStaticMarkup(
		this: RendererContext,
		Component: I18nSolidComponent,
		props: I18nSolidProps,
		children: Record<string, string>,
		metadata?: AstroComponentMetadata
	) {
		const { language } = getLocale(this.result.request);
		return solidRenderer.renderToStaticMarkup.call(
			this,
			wrapComponentWithI18n(Component, createRequestTranslationFactory(language)),
			props,
			children,
			metadata
		);
	},
	renderHydrationScript: solidRenderer.renderHydrationScript,
	supportsAstroStaticSlot: solidRenderer.supportsAstroStaticSlot,
};

export default renderer;
