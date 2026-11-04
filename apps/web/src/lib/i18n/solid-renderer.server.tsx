import solidRenderer from "@astrojs/solid-js/server.js";
import type { AstroComponentMetadata, NamedSSRLoadedRendererValue } from "astro";
import { FaneeRuntime } from "@fanee/core";
import {
	type I18nSolidComponent,
	type I18nSolidProps,
	wrapComponentWithI18n,
} from "./component-context";
import { getLocale, i18nServer } from "./server";
import { defaultLanguage } from "./const";

type RendererContext = {
	result: {
		request: Request;
	};
};

const createRequestRuntime = async (locale: string) => {
	const runtime = new FaneeRuntime().config({
		currentLocale: locale,
		defaultLocale: defaultLanguage,
		baseNamespace: "web:client",
		resources: i18nServer.getAllTranslations(),
	});
	await runtime.ready();
	return { runtime };
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
		const { runtime } = await createRequestRuntime(language);
		return solidRenderer.check.call(
			this,
			wrapComponentWithI18n(Component, runtime),
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
		const { runtime } = await createRequestRuntime(language);
		return solidRenderer.renderToStaticMarkup.call(
			this,
			wrapComponentWithI18n(Component, runtime),
			props,
			children,
			metadata
		);
	},
	renderHydrationScript: solidRenderer.renderHydrationScript,
	supportsAstroStaticSlot: solidRenderer.supportsAstroStaticSlot,
};

export default renderer;
