import type { BundleResources } from "@fanee/core";
import { ClientI18nPayloadSchema, type ClientI18nPayload } from "@cvsa/contracts";
import { defaultLanguage } from "./const";

export type { ClientI18nPayload } from "@cvsa/contracts";

export const CLIENT_I18N_SCRIPT_ID = "cvsa-i18n";

export const createClientI18nPayload = (
	locale: string,
	namespaces: readonly string[],
	resources: BundleResources
): ClientI18nPayload => ({
	locale,
	resources: Object.fromEntries(
		namespaces.map((namespace) => {
			const fullNamespace = `web:client:${namespace}`;
			const messages = resources[fullNamespace];
			if (!messages) throw new Error(`Unknown client i18n namespace: ${namespace}`);
			return [
				fullNamespace,
				Object.fromEntries(
					Object.entries(messages).filter(
						([language]) => language === locale || language === defaultLanguage
					)
				),
			];
		})
	),
});

export const serializeClientI18nPayload = (payload: ClientI18nPayload): string => {
	return JSON.stringify(payload)
		.replaceAll("&", "\\u0026")
		.replaceAll("<", "\\u003C")
		.replaceAll(">", "\\u003E")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
};

export const parseClientI18nPayload = (value: unknown): ClientI18nPayload | undefined => {
	const parsed = ClientI18nPayloadSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
};
