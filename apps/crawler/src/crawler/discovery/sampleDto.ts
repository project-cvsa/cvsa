import type { DiscoverySampleItem, VideoAnnotationDto, VideoCurationDto } from "@cvsa/contracts";
import type { DiscoverySample, VideoAnnotation, VideoCuration } from "@cvsa/snapshot-db";

function toRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value));
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

/**
 * Classifier probabilities are persisted as the model's array output, while the
 * admin contract exposes named probabilities. Indexes are stable for a given
 * model version, so `class_0`, `class_1`, ... is the faithful mapping.
 */
function toNumberRecord(value: unknown): Record<string, number> {
	if (Array.isArray(value)) {
		return Object.fromEntries(
			value.flatMap((item, index) =>
				typeof item === "number" && Number.isFinite(item) ? [[`class_${index}`, item]] : []
			)
		);
	}
	const source = toRecord(value);
	return Object.fromEntries(
		Object.entries(source).flatMap(([key, item]) =>
			typeof item === "number" && Number.isFinite(item) ? [[key, item]] : []
		)
	);
}

export function toSampleItem(
	row: DiscoverySample,
	pic?: string | null,
	curation?: VideoCuration | null,
	annotationsCount?: number
): DiscoverySampleItem {
	return {
		aid: row.aid.toString(),
		bvid: row.bvid,
		title: row.title,
		description: row.description ?? "",
		tags: toStringArray(row.tags),
		decision: row.decision,
		modelVersion: row.modelVersion,
		pic: pic ?? null,
		probabilities: toNumberRecord(row.probabilities),
		songProbability: row.songProbability,
		humanLabel: row.humanLabel,
		labeledAt: row.labeledAt ? row.labeledAt.toString() : null,
		capturedAt: row.createdAt.toString(),
		curationStatus: (curation?.status as "accepted" | "rejected" | "pending") ?? null,
		curatedBy: curation?.curatedBy ?? null,
		curatedAt: curation?.curatedAt ? curation.curatedAt.toString() : null,
		annotationsCount: annotationsCount ?? 0,
	};
}

export function toAnnotationItem(row: VideoAnnotation): VideoAnnotationDto {
	return {
		id: row.id.toString(),
		aid: row.aid.toString(),
		bvid: row.bvid,
		userId: row.userId,
		decision: row.decision as "accepted" | "rejected" | "uncertain",
		tags: toStringArray(row.tags),
		notes: row.notes,
		createdAt: row.createdAt.toString(),
	};
}

export function toCurationItem(row: VideoCuration): VideoCurationDto {
	return {
		aid: row.aid.toString(),
		bvid: row.bvid,
		status: row.status as "accepted" | "rejected" | "pending",
		curatedBy: row.curatedBy,
		reason: row.reason,
		curatedAt: row.curatedAt.toString(),
		updatedAt: row.updatedAt.toString(),
	};
}
