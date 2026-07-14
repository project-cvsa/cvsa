export const supportedLanguages = ["zh-CN", "zh-TW", "zh-HK", "en-US"];
export const supportedBaseLanguages = [
	...new Set(
		supportedLanguages.map((lang) => {
			return lang.split("-")[0];
		})
	),
];
