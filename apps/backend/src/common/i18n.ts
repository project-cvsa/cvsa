import { env } from "@cvsa/env";
import { FaneeRuntime } from "@fanee/runtime-node";
import path from "node:path";

const getBundleLocation = () => {
	if (env.NODE_ENV !== "production") {
		return path.join(import.meta.dir, "../../../../locale/");
	} else {
		return path.join(import.meta.dir, "./locale/");
	}
};

export const i18nRuntime: FaneeRuntime = new FaneeRuntime({
	bundlePath: getBundleLocation(),
	defaultLocale: "zh",
	namespace: "backend",
});

await i18nRuntime.load();
