import { env } from "@cvsa/env";
import { i18n } from "@fanee/core";
import path from "node:path";
import { initFaneeNode } from "@fanee/node";

const getBundleLocation = () => {
	if (env.NODE_ENV !== "production") {
		return path.join(import.meta.dir, "../../../../locale/");
	} else {
		return path.join(import.meta.dir, "./locale/");
	}
};

i18n.use(
	initFaneeNode({
		bundlePath: getBundleLocation(),
	})
);

export const i18nRuntime = i18n;

await i18n.ready();
