import type { CrawlerQueueJobItem, DiscoveryActivity } from "@cvsa/contracts";
import { formatDateTime } from "./format";

export function queueJobName(
	job: Pick<CrawlerQueueJobItem, "queue" | "name">,
	t: (key: string) => string
): string {
	if (job.queue === "tracking") return t("metrics.queue.tracking");
	if (job.name.startsWith("detail-") || job.name === "fetch-video-details")
		return t("discoveryActivity.typeDetails");
	if (job.name.includes("deep")) return t("discoveryActivity.typeDeep");
	if (job.name.includes("sweep")) return t("discoveryActivity.typeIncremental");
	if (
		job.name.includes("hot-sample") ||
		job.name.startsWith("active-") ||
		job.name === "active-discovery"
	)
		return t("discoveryActivity.typeRelated");
	return job.name;
}

export function discoveryJobTypeMessageKey(job: DiscoveryActivity): string {
	switch (job.task?.type) {
		case "search-sweep":
			if (job.task.config?.from !== undefined || job.task.config?.to !== undefined)
				return "discoveryActivity.typeRange";
			return (job.task.mode ?? job.task.config?.mode) === "deep"
				? "discoveryActivity.typeDeep"
				: "discoveryActivity.typeIncremental";
		case "hot-sample":
			return "discoveryActivity.typeHotSample";
		case "fetch-video-details":
			return "discoveryActivity.typeDetails";
		case "active-discovery":
			return "discoveryActivity.typeRelated";
		default:
			return "discoveryActivity.typeTask";
	}
}

export function discoveryJobTarget(job: DiscoveryActivity, t: (key: string) => string): string {
	if (job.task?.type !== "search-sweep") return job.target ?? "—";
	const config = job.task.config;
	const keywords = config?.keywords;
	const label = keywords?.length
		? keywords.length === 1
			? keywords[0]
			: t("discoveryActivity.keywordCount").replace("{count}", String(keywords.length))
		: t("discoveryActivity.configuredKeywords");
	const date = (value: string | number | undefined, fallback: string) =>
		value === undefined
			? t(fallback)
			: formatDateTime(
					new Date(typeof value === "number" ? value * 1000 : value).toISOString(),
					true
				);
	if (config?.from !== undefined || config?.to !== undefined)
		return `${label} · ${date(config.from, "discoveryActivity.earliest")} – ${date(config.to, "discoveryActivity.present")}`;
	if (config?.timeWindowDays !== undefined)
		return `${label} · ${t("discoveryActivity.lookbackDays").replace("{days}", String(config.timeWindowDays))}`;
	return label;
}

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
