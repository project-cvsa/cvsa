/** Formatting helpers shared by the crawler console panels. */

/** Render a metric with at most two decimals and no locale-dependent separators. */
export function formatMetric(value: number): string {
	if (!Number.isFinite(value)) return "—";
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/** Render a `0..1` fraction as a percentage. */
export function formatPercent(fraction: number, digits = 1): string {
	if (!Number.isFinite(fraction)) return "—";
	const clamped = Math.min(1, Math.max(0, fraction));
	return `${(clamped * 100).toFixed(digits)}%`;
}

/** Render a wait/lag duration in seconds as a compact human string. */
export function formatWaitSeconds(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "—";
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3_600) {
		const minutes = Math.floor(seconds / 60);
		return `${minutes}m ${Math.round(seconds % 60)}s`;
	}
	const hours = Math.floor(seconds / 3_600);
	return `${hours}h ${Math.floor((seconds % 3_600) / 60)}m`;
}

/** Render an ISO timestamp; invalid values fall back to the raw string. */
export function formatDateTime(value: string | null | undefined, dateOnly = false): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return dateOnly ? date.toLocaleDateString() : date.toLocaleString();
}

/** Normalize a metadata `tags` column (JSON array, JSON string, or plain string). */
export function formatTags(tags: unknown): string[] {
	if (Array.isArray(tags)) {
		return tags.map((tag) => (typeof tag === "string" ? tag : describeTag(tag)));
	}
	if (typeof tags !== "string") return [];
	try {
		const parsed: unknown = JSON.parse(tags);
		if (Array.isArray(parsed)) {
			return parsed.map((tag) => (typeof tag === "string" ? tag : describeTag(tag)));
		}
	} catch {
		return [tags];
	}
	return [tags];
}

function describeTag(tag: unknown): string {
	if (typeof tag === "string") return tag;
	const serialized = JSON.stringify(tag);
	return serialized === undefined ? String(tag) : serialized;
}
