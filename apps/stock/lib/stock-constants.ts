/** Number of sliding windows per stock sparkline (42 × 4h = 7 days). */
export const WINDOW_COUNT = 42 + 1;

/** Step between windows in hours. */
export const STEP_HOURS = 4;

/** Width of each window in hours (24h increments). */
export const WINDOW_HOURS = 24;

export const STEP_PER_WINDOW = WINDOW_HOURS / STEP_HOURS;

/** Divisor for the market index to keep values readable. */
export const INDEX_FACTOR = 1000;

/** Number of top stocks to average per window when computing the market index. */
export const INDEX_SIZE = 100;

// Derived constants
export const STEP_HOURS_MS = STEP_HOURS * 3600 * 1000;

/** Total lookback in hours: spans all windows plus a 24h safety margin for findNearest. */
export const TOTAL_LOOKBACK_HOURS = WINDOW_COUNT * STEP_HOURS + WINDOW_HOURS + 24;

export function lookbackHours(windowCount: number): number {
	return windowCount * STEP_HOURS + WINDOW_HOURS + 24;
}

export const RANGE_CONFIG: Record<string, number> = {
	week: 7 * STEP_PER_WINDOW + 1,
	"2week": 14 * STEP_PER_WINDOW + 1,
	month: 30 * STEP_PER_WINDOW + 1,
	quarter: 90 * STEP_PER_WINDOW + 1,
	year: 365 * STEP_PER_WINDOW + 1,
};

export const RANGE_LABELS: Record<string, string> = {
	week: "周",
	"2week": "2周",
	month: "月",
	quarter: "季度",
	year: "年",
};

export const DEFAULT_RANGE = "week";

/** Floors a timestamp to the nearest 4-hour grid boundary. */
export function snapToGrid(ts: number): Date {
	return new Date(Math.floor(ts / STEP_HOURS_MS) * STEP_HOURS_MS);
}
