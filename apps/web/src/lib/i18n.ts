import { FaneeRuntime } from "@fanee/runtime-node";
import path from "node:path";

const getBundleLocation = () => {
	if (import.meta.env.DEV) {
		return "../../locale/";
	} else {
		return path.join(import.meta.dir, "../locale/");
	}
};

export const i18nRuntime: FaneeRuntime = new FaneeRuntime({
	bundlePath: getBundleLocation(),
	defaultLocale: "zh-CN",
	namespace: "web",
});

await i18nRuntime.load();
