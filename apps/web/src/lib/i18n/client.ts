import { FaneeRuntime } from "@fanee/core";
import { defaultLanguage } from "./const";
import { CLIENT_I18N_SCRIPT_ID, parseClientI18nPayload } from "./payload";

const i18n = new FaneeRuntime().config({
	baseNamespace: "web:client",
	defaultLocale: defaultLanguage,
});

const readClientI18nPayload = () => {
	if (typeof document === "undefined") return undefined;

	const script = document.getElementById(CLIENT_I18N_SCRIPT_ID);
	if (!script) return undefined;

	try {
		const value: unknown = JSON.parse(script.textContent ?? "");
		const payload = parseClientI18nPayload(value);
		if (!payload) {
			console.error("[CVSA] Invalid client i18n payload.");
		}
		return payload;
	} catch (error) {
		console.error("[CVSA] Failed to parse client i18n payload.", error);
		return undefined;
	}
};

const payload = readClientI18nPayload();
if (payload) {
	await i18n
		.config({
			currentLocale: payload.locale,
			resources: payload.resources,
		})
		.ready();
}

export { i18n };
