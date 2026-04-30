export type ColorMode = "red-up" | "green-up";

export interface StockColors {
	up: string;
	down: string;
	upBg: string;
	downBg: string;
	upText: string;
	downText: string;
}

const COLORS: Record<ColorMode, StockColors> = {
	"red-up": {
		up: "#ef4444",
		down: "#22c55e",
		upBg: "bg-red-500",
		downBg: "bg-green-600",
		upText: "text-red-500",
		downText: "text-green-500",
	},
	"green-up": {
		up: "#22c55e",
		down: "#ef4444",
		upBg: "bg-green-600",
		downBg: "bg-red-500",
		upText: "text-green-500",
		downText: "text-red-500",
	},
};

export function getStockColors(mode: ColorMode): StockColors {
	return COLORS[mode];
}

export function getChangeColor(mode: ColorMode, change: number): string {
	const c = COLORS[mode];
	return change >= 0 ? c.up : c.down;
}

export function getChangeBg(mode: ColorMode, change: number): string {
	const c = COLORS[mode];
	return change >= 0 ? c.upBg : c.downBg;
}

export function getChangeText(mode: ColorMode, change: number): string {
	const c = COLORS[mode];
	return change >= 0 ? c.upText : c.downText;
}
