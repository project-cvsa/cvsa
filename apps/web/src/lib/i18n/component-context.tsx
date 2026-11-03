import type { FaneeRuntime } from "@fanee/core";
import { FaneeProvider } from "@fanee/solid";
import { type Component, createComponent } from "solid-js";

export type I18nSolidProps = Record<string, unknown>;
export type I18nSolidComponent = Component<I18nSolidProps>;

export const wrapComponentWithI18n = (
	Component: I18nSolidComponent,
	runtime: FaneeRuntime
): I18nSolidComponent => {
	return (props) =>
		createComponent(FaneeProvider, {
			runtime,
			get children() {
				return createComponent(Component, props);
			},
		});
};
