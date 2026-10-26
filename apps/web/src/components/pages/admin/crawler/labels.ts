/** Display labels for crawler state values the console renders as prose. */

const DECISION_LABELS: Record<string, string> = {
	whitelist: "Whitelist",
	model_accepted: "Model accepted",
	model_rejected: "Model rejected (sampled)",
	model_rejected_sampled: "Model rejected (sampled)",
};

/** Label for a stored discovery `decision`; unknown values render as-is. */
export function describeDecision(decision: string): string {
	return DECISION_LABELS[decision] ?? decision;
}

/**
 * Label for the tracking row's `filterDecision` (`accepted` / `rejected`),
 * which records whether the video entered tracking.
 */
export function describeFilterDecision(decision: string): string {
	if (decision === "accepted") return "Accepted";
	if (decision === "rejected") return "Rejected";
	return decision;
}

/** Label for a sample's `humanLabel` column. */
export function describeHumanLabel(humanLabel: number | null): string {
	if (humanLabel === 1) return "Song";
	if (humanLabel === 0) return "Not song";
	return "Unlabeled";
}

/** Label for a tracking state. */
export function describeTrackingState(state: string): string {
	switch (state) {
		case "new":
			return "New";
		case "regular":
			return "Regular";
		case "milestone":
			return "Milestone";
		case "archive":
			return "Archive";
		default:
			return state;
	}
}

/** Title-case label for an arbitrary status token (`healthy` -> `Healthy`). */
export function describeStatus(status: string): string {
	if (!status) return "Unknown";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

const METADATA_CHANGE_LABELS: Record<string, string> = {
	created: "Created",
	updated: "Updated",
	status_changed: "Status changed",
};

/** Label for a metadata history row's `changeType`. */
export function describeMetadataChange(changeType: string): string {
	return METADATA_CHANGE_LABELS[changeType] ?? changeType;
}

const METADATA_FIELD_LABELS: Record<string, string> = {
	title: "Title",
	description: "Description",
	pic: "Cover",
	tid: "Category ID",
	tname: "Category",
	ownerName: "Uploader",
	duration: "Duration",
	state: "State",
	videoStatus: "Video status",
	tags: "Tags",
	pages: "Pages",
	staff: "Staff",
};

/** Label for a changed metadata field inside the history diff. */
export function describeMetadataField(field: string): string {
	return METADATA_FIELD_LABELS[field] ?? field;
}
