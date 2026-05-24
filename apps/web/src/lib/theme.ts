const primitives = {
	gray: {
		0: "#FFFFFF",
		40: "#F2F2F2",
		60: "#EBEBEB",
		100: "#DEDEDE",
		150: "#CECECE",
		200: "#BDBDBD",
		220: "#B7B7B7",
		260: "#ABABAB",
		300: "#9E9E9E",
		350: "#8F8F8F",
		400: "#808080",
		460: "#6F6F6F",
		500: "#636363",
		540: "#585858",
		600: "#484848",
		650: "#3A3A3A",
		740: "#242424",
		800: "#161616",
		840: "#0D0D0D",
		880: "#060606",
		1000: "#000000",
	},
	red: {
		404: "#EE0000",
	},
	yellow: {
		60: "#FFF12F",
		100: "#FEDE23",
	},
} as const;

const baseVariables = {
	"--background": {
		light: primitives.gray[40],
		dark: primitives.gray[880],
	},
	"--grid-lines": {
		light: primitives.gray[60],
		dark: primitives.gray[840],
	},
	"--split-lines": {
		light: primitives.gray[200],
		dark: primitives.gray[540],
	},
	"--border": {
		light: primitives.gray[200],
		dark: primitives.gray[540],
	},
	"--surface": {
		light: primitives.gray[0],
		dark: primitives.gray[740],
	},
	"--surface-container-high": {
		light: primitives.gray[0],
		dark: primitives.gray[740],
	},
	"--surface-container-medium": {
		light: primitives.gray[60],
		dark: primitives.gray[600],
	},
	"--surface-container-low": {
		light: primitives.gray[100],
		dark: primitives.gray[460],
	},
	"--display": {
		light: primitives.gray[840],
		dark: primitives.gray[0],
	},
	"--primary": {
		light: primitives.gray[600],
		dark: primitives.gray[60],
	},
	"--secondary": {
		light: primitives.gray[460],
		dark: primitives.gray[150],
	},
	"--tertiary": {
		light: primitives.gray[350],
		dark: primitives.gray[220],
	},
	"--quaternary": {
		light: primitives.gray[260],
		dark: primitives.gray[300],
	},
	"--error": {
		light: primitives.red[404],
		dark: primitives.red[404],
	},
	"--on-error": {
		light: primitives.gray[0],
		dark: primitives.gray[0],
	},
	"--highlight": {
		light: primitives.yellow[60],
		dark: primitives.yellow[100],
	},
	"--shadow": {
		light: primitives.gray[1000] + "10",
		dark: primitives.gray[1000] + "30",
	}
} as const;

const keysToInvert: Array<keyof typeof baseVariables> = [
	"--surface",
	"--surface-container-high",
	"--surface-container-medium",
	"--surface-container-low",
	"--display",
	"--primary",
	"--secondary",
	"--tertiary",
	"--quaternary",
];

const semanticVariables: Record<string, { light: string; dark: string }> = {
	...baseVariables,
};

keysToInvert.forEach((key) => {
	const original = baseVariables[key];
	semanticVariables[`${key}-inverted`] = {
		light: original.dark,
		dark: original.light,
	};
});

const stringifyVariables = (theme: "light" | "dark", indent = "  "): string => {
	return Object.entries(semanticVariables)
		.map(([key, value]) => `${indent}${key}: ${value[theme]};`)
		.join("\n");
};

export function getThemeColorVariables(theme: string): string {
	const lightContent = stringifyVariables("light");
	const darkContent = stringifyVariables("dark");

	if (theme === "light") return `:root {\n${lightContent}\n}`;
	if (theme === "dark") return `:root {\n${darkContent}\n}`;

	return `
:root {
    ${lightContent}
}
  
@media (prefers-color-scheme: dark) {
    :root {
        ${darkContent}
    }
}`;
}

export function getUnoCSSColors() {
	const colors: Record<string, string> = {};

	Object.keys(semanticVariables).forEach((cssVar) => {
		const cleanKey = cssVar.replace(/^--/, "");
		colors[cleanKey] = `var(${cssVar})`;
	});

	return colors;
}
