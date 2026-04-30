export interface Stock {
	id: string;
	name: string;
	symbol: string;
	price: number;
	change: number;
	changePercent: number;
	sparkline: number[];
}

export interface MarketIndex {
	name: string;
	value: number;
	change: number;
	changePercent: number;
	history: number[];
}

function generateRandomPoints(count: number, min: number, max: number): number[] {
	const points: number[] = [];
	let current = min + Math.random() * (max - min);

	for (let i = 0; i < count; i++) {
		const volatility = (max - min) * 0.02;
		current += (Math.random() - 0.5) * volatility;
		current = Math.max(min, Math.min(max, current));
		points.push(Number(current.toFixed(2)));
	}

	return points;
}

export function generateMarketIndex(): MarketIndex {
	const indexBaseValue = 3200 + Math.random() * 200;
	const indexHistory = generateRandomPoints(55, indexBaseValue * 0.95, indexBaseValue * 1.05);
	const indexCurrentValue = indexHistory[indexHistory.length - 1];
	const indexStartValue = indexHistory[0];
	const indexChange = Number((indexCurrentValue - indexStartValue).toFixed(2));
	const indexChangePercent = Number(((indexChange / indexStartValue) * 100).toFixed(2));

	return {
		name: "上证指数",
		value: Number(indexCurrentValue.toFixed(2)),
		change: indexChange,
		changePercent: indexChangePercent,
		history: indexHistory,
	};
}
