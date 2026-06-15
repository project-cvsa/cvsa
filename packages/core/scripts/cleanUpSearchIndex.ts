import { searchManager } from "../src";
import { INDEX_SETTINGS } from "../src/search/config";

await searchManager.clearAllIndex();
const langs = ["en", "zh", "ja"];
const keys = Object.keys(INDEX_SETTINGS);
for (const lang of langs) {
	for (const key of keys) {
		await searchManager.createIndex(`${key}_${lang}`);
	}
}

process.exit(0);
