import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import {
	DEFAULT_TRACKING_POLICY,
	type CrawlerExecutionConfig,
	type TrackingPolicyConfig,
	type RetryPolicy,
} from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";

type NumericTrackingKey = Exclude<
	keyof TrackingPolicyConfig,
	"initialSamplingMinutes" | "regularDailyTiers" | "queueCap"
>;
const TRACKING_FIELDS: Array<{ key: NumericTrackingKey; min: number; max: number }> = [
	{ key: "newMaxAgeHours", min: 1, max: 8760 },
	{ key: "newMinVelocityAfter2h", min: 0, max: 1000000 },
	{ key: "minRegularIntervalHours", min: 1.5, max: 8760 },
	{ key: "milestoneMaxEtaHours", min: 1, max: 8760 },
	{ key: "milestoneCaptureLeadMs", min: 1000, max: 86400000 },
	{ key: "milestoneCaptureIntervalMs", min: 1000, max: 59000 },
	{ key: "milestoneRetryMs", min: 100, max: 59000 },
	{ key: "newRetryMs", min: 100, max: 3600000 },
	{ key: "regularRetryMs", min: 100, max: 86400000 },
	{ key: "archiveRetryMs", min: 100, max: 86400000 },
	{ key: "milestoneMaxLatenessMs", min: 1000, max: 3600000 },
	{ key: "newMaxLatenessMs", min: 1000, max: 86400000 },
	{ key: "regularMaxLatenessMs", min: 1000, max: 86400000 },
	{ key: "archiveMaxLatenessMs", min: 1000, max: 604800000 },
	{ key: "archiveIntervalDays", min: 1, max: 3650 },
];
const RETRY_FIELDS: Array<keyof RetryPolicy> = ["maxAttempts", "baseDelayMs", "maxDelayMs"];

export default function CrawlerSchedulingPolicy(props: {
	config: CrawlerExecutionConfig;
	onChange: (config: CrawlerExecutionConfig) => void;
}) {
	const t = getComponentT("crawler");
	const tracking = () => ({ ...DEFAULT_TRACKING_POLICY, ...props.config.tracking });
	return (
		<section class="flex flex-col gap-4">
			<h3 class="ts-heading-3 text-primary">{t("scheduling.title")}</h3>
			<p class="ts-caption text-secondary">{t("scheduling.description")}</p>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<For each={TRACKING_FIELDS}>
					{(field) => (
						<NumberField
							label={t(`scheduling.${field.key}`)}
							value={tracking()[field.key]}
							min={field.min}
							max={field.max}
							onChange={(value) =>
								props.onChange({
									...props.config,
									tracking: { ...props.config.tracking, [field.key]: value },
								})
							}
						/>
					)}
				</For>
			</div>
			<h3 class="ts-heading-3 text-primary">{t("scheduling.discoveryRetry")}</h3>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<For each={RETRY_FIELDS}>
					{(key) => (
						<NumberField
							label={t(`scheduling.${key}`)}
							min={key === "maxAttempts" ? 1 : 100}
							max={key === "maxAttempts" ? 20 : 86400000}
							value={props.config.discoveryRetry[key]}
							onChange={(value) =>
								props.onChange({
									...props.config,
									discoveryRetry: {
										...props.config.discoveryRetry,
										[key]: value,
									},
								})
							}
						/>
					)}
				</For>
			</div>
		</section>
	);
}
