/** Filter mappings for the discovery samples table. */

export type SampleDecisionFilter =
	| "all"
	| "whitelist"
	| "model_accepted"
	| "model_rejected_sampled";

export type SampleLabeledFilter = "all" | "labeled" | "unlabeled";

/**
 * The crawler stores sampled rejections as `model_rejected`; the console exposes
 * them as "rejected (sampled)" so the filter matches the decision it returns.
 */
export function toSampleDecisionQuery(filter: SampleDecisionFilter): string | undefined {
	if (filter === "all") return undefined;
	if (filter === "model_rejected_sampled") return "model_rejected";
	return filter;
}

/** `undefined` means "either label state". */
export function toSampleLabeledQuery(filter: SampleLabeledFilter): boolean | undefined {
	if (filter === "all") return undefined;
	return filter === "labeled";
}
