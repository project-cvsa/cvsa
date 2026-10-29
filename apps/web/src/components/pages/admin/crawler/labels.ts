/** Message keys for crawler values the console renders as prose. */

/**
 * Locale keys for the metadata fields the crawler records in history. Covers
 * both the currently tracked fields and the extended v2 fields the API may
 * return, so a future tracked field still renders a translated label.
 */
const METADATA_FIELD_MESSAGE_KEYS: Readonly<Record<string, string>> = {
	title: "videoDetail.field.title",
	description: "videoDetail.field.description",
	pic: "videoDetail.field.pic",
	tid: "videoDetail.field.tid",
	tname: "videoDetail.field.tname",
	ownerName: "videoDetail.field.ownerName",
	duration: "videoDetail.field.duration",
	state: "videoDetail.field.state",
	videoStatus: "videoDetail.field.videoStatus",
	tags: "videoDetail.field.tags",
	pages: "videoDetail.field.pages",
	staff: "videoDetail.field.staff",
	tidV2: "videoDetail.field.tidV2",
	tnameV2: "videoDetail.field.tnameV2",
	cid: "videoDetail.field.cid",
	videos: "videoDetail.field.videos",
	dynamic: "videoDetail.field.dynamic",
	dimension: "videoDetail.field.dimension",
	rights: "videoDetail.field.rights",
	honorReply: "videoDetail.field.honorReply",
	descV2: "videoDetail.field.descV2",
	modelScore: "videoDetail.field.modelScore",
	modelVersion: "videoDetail.field.modelVersion",
	filterDecision: "videoDetail.field.filterDecision",
	discoverySource: "videoDetail.field.discoverySource",
};

/** Locale key for a metadata history field, or `null` when it has no translation. */
export function metadataFieldMessageKey(field: string): string | null {
	return METADATA_FIELD_MESSAGE_KEYS[field] ?? null;
}

const METADATA_CHANGE_MESSAGE_KEYS: Readonly<Record<string, string>> = {
	created: "videoDetail.changeType.created",
	updated: "videoDetail.changeType.updated",
	status_changed: "videoDetail.statusChanged",
};

/** Locale key for a metadata history `changeType`, or `null` when unknown. */
export function metadataChangeMessageKey(changeType: string): string | null {
	return METADATA_CHANGE_MESSAGE_KEYS[changeType] ?? null;
}

const FILTER_DECISION_MESSAGE_KEYS: Readonly<Record<string, string>> = {
	accepted: "videoDetail.accepted",
	rejected: "videoDetail.rejected",
};

/** Locale key for a stored `filterDecision` value, or `null` when unknown. */
export function filterDecisionMessageKey(decision: string): string | null {
	return FILTER_DECISION_MESSAGE_KEYS[decision] ?? null;
}
