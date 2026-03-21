//@ts-check
import postcssPresetEnv from "postcss-preset-env";

/** @type {import('postcss-load-config').Config} */
export default {
	plugins: [
		postcssPresetEnv({
			browsers: "chrome >= 67, edge >= 79, firefox >= 75, safari >= 14",
		}),
	],
};
