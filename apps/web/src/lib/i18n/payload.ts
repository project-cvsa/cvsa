import type { BundleResources, LocaleMessages, NamespaceResources } from "@fanee/core";

export const CLIENT_I18N_SCRIPT_ID = "cvsa-i18n";

export interface ClientI18nPayload {
	locale: string;
	resources: BundleResources;
}

export const serializeClientI18nPayload = (payload: ClientI18nPayload): string => {
	return JSON.stringify(payload)
		.replaceAll("&", "\\u0026")
		.replaceAll("<", "\\u003C")
		.replaceAll(">", "\\u003E")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isLocaleMessages = (value: unknown): value is LocaleMessages => {
	return isRecord(value) && Object.values(value).every((message) => typeof message === "string");
};

const isNamespaceResources = (value: unknown): value is NamespaceResources => {
	return isRecord(value) && Object.values(value).every(isLocaleMessages);
};

const isBundleResources = (value: unknown): value is BundleResources => {
	return isRecord(value) && Object.values(value).every(isNamespaceResources);
};

export const parseClientI18nPayload = (value: unknown): ClientI18nPayload | undefined => {
	if (!isRecord(value)) return undefined;

	const { locale, resources } = value;
	if (typeof locale !== "string" || !isBundleResources(resources)) {
		return undefined;
	}

	return { locale, resources };
};
