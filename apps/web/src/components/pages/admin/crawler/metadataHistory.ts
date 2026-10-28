/** Helpers for rendering a metadata history row's `changedFields` diff. */

export type MetadataFieldDiff = {
	field: string;
	before: string;
	after: string;
};

type FieldChange = {
	old: unknown;
	new: unknown;
};

const MAX_VALUE_LENGTH = 160;

function truncate(value: string): string {
	return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH - 1)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTags(value: unknown[]): string {
	if (value.length === 0) return "—";
	const names = value.map((item) => {
		if (isRecord(item) && typeof item.name === "string") return item.name;
		return String(item);
	});
	return truncate(names.join(", "));
}

function formatPages(value: unknown[]): string {
	if (value.length === 0) return "—";
	const parts = value.map((item, idx) => {
		if (isRecord(item)) {
			const num = item.page ?? idx + 1;
			const part = item.part ? String(item.part) : "";
			const dur = item.duration ? ` (${item.duration}s)` : "";
			return `P${num}: ${part}${dur}`.trim();
		}
		return `P${idx + 1}`;
	});
	return truncate(parts.join("; "));
}

/** Render one stored field value, formatting complex types human-readably. */
export function formatFieldDiffValue(field: string, value: unknown): string {
	if (value === null || value === undefined) return "—";
	if (typeof value === "string") {
		if ((field === "tags" || field === "pages") && value.startsWith("[")) {
			try {
				const parsed = JSON.parse(value);
				if (Array.isArray(parsed)) {
					return field === "tags" ? formatTags(parsed) : formatPages(parsed);
				}
			} catch {
				// fallback to string formatting
			}
		}
		return value.trim() ? truncate(value) : "—";
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (typeof value === "bigint") return value.toString();

	if (field === "tags" && Array.isArray(value)) {
		return formatTags(value);
	}
	if (field === "pages" && Array.isArray(value)) {
		return formatPages(value);
	}

	try {
		const serialized = JSON.stringify(value);
		return serialized === undefined ? String(value) : truncate(serialized);
	} catch {
		return String(value);
	}
}

export function formatFieldValue(value: unknown): string {
	return formatFieldDiffValue("", value);
}

/**
 * The crawler stores each changed field as `{ old, new }`. Values that do not
 * carry that pair are shown as a new value, so a schema change degrades to a
 * readable row instead of an empty one.
 */
function readFieldChange(value: unknown): FieldChange {
	if (isRecord(value) && "old" in value && "new" in value) {
		return { old: value.old, new: value.new };
	}
	return { old: null, new: value };
}

/** Flatten `changedFields` into table rows, preserving the stored field order. */
export function toMetadataFieldDiffs(changedFields: Record<string, unknown>): MetadataFieldDiff[] {
	return Object.entries(changedFields).map(([field, value]) => {
		const change = readFieldChange(value);
		return {
			field,
			before: formatFieldDiffValue(field, change.old),
			after: formatFieldDiffValue(field, change.new),
		};
	});
}

/** True when the row recorded at least one field change. */
export function hasFieldDiffs(changedFields: Record<string, unknown>): boolean {
	return Object.keys(changedFields).length > 0;
}

/**
 * Read a field the API may return beyond the declared DTO shape (for example
 * `cid` or `staff` on archive metadata). Returns `null` when the field is absent
 * so the caller can omit the row instead of rendering an empty placeholder.
 */
export function readOptionalFieldText(source: object, field: string): string | null {
	const entry = Object.entries(source).find(([name]) => name === field);
	if (!entry || entry[1] === null || entry[1] === undefined) return null;
	return formatFieldDiffValue(field, entry[1]);
}
