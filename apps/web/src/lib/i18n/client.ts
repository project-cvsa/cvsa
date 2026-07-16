import { i18n } from "@fanee/core";
import { resources } from "virtual:fanee/web";

export const i18nClient = i18n.config({ defaultLocale: "en", baseNamespace: "web", resources });

await i18nClient.ready();
