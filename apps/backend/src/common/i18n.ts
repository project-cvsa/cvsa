import { existsSync } from "node:fs";
import path from "node:path";
import { i18n } from "@fanee/core";
import { initFaneeNode } from "@fanee/node";

const getBundleLocation = () => {
	const candidates = [
		path.resolve(import.meta.dir, "../../../../locale"),
		path.resolve(process.cwd(), "locale"),
		path.resolve(process.cwd(), "../../locale"),
		path.resolve(import.meta.dir, "./locale"),
	];
	for (const candidate of candidates) {
		if (existsSync(path.join(candidate, "manifest.json"))) {
			return candidate;
		}
	}
	return path.resolve(import.meta.dir, "../../../../locale");
};

i18n.use(
	initFaneeNode({
		bundlePath: getBundleLocation(),
	})
);

export const i18nRuntime = i18n;

await i18n.ready();
