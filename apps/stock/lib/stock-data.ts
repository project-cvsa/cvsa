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
	/** ISO string of the grid-snapped `now` used to compute windows (newest point). */
	baseTime: string;
	/** Milliseconds between consecutive history points. Defaults to 4h. */
	pointIntervalMs?: number;
	/** Monday 08:00 CST index value for the "open" line on the chart. */
	openValue?: number;
	/** Highest value in the displayed range. */
	highValue?: number;
	/** Lowest value in the displayed range. */
	lowValue?: number;
}
