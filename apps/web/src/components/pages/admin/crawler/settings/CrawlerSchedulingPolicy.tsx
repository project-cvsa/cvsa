import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import Table from "@components/ui/Table";
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
const FIELDS: Array<{ key: NumericTrackingKey; min: number; max: number; scale: number }> = [
	{ key: "newMaxAgeHours", min: 1, max: 8760, scale: 1 },
	{ key: "newMinVelocityAfter2h", min: 0, max: 1000000, scale: 1 },
	{ key: "minRegularIntervalHours", min: 1.5, max: 8760, scale: 1 },
	{ key: "milestoneMaxEtaHours", min: 1, max: 8760, scale: 1 },
	{ key: "milestoneCaptureLeadMs", min: 1, max: 86400, scale: 1000 },
	{ key: "milestoneCaptureIntervalMs", min: 1, max: 59, scale: 1000 },
	{ key: "archiveIntervalDays", min: 1, max: 3650, scale: 1 },
];
const STATES: Array<{
	state: string;
	retry: NumericTrackingKey;
	lateness: NumericTrackingKey;
	maxRetry: number;
	maxLateness: number;
}> = [
	{
		state: "new",
		retry: "newRetryMs",
		lateness: "newMaxLatenessMs",
		maxRetry: 3600,
		maxLateness: 86400,
	},
	{
		state: "regular",
		retry: "regularRetryMs",
		lateness: "regularMaxLatenessMs",
		maxRetry: 86400,
		maxLateness: 86400,
	},
	{
		state: "milestone",
		retry: "milestoneRetryMs",
		lateness: "milestoneMaxLatenessMs",
		maxRetry: 59,
		maxLateness: 3600,
	},
	{
		state: "archive",
		retry: "archiveRetryMs",
		lateness: "archiveMaxLatenessMs",
		maxRetry: 86400,
		maxLateness: 604800,
	},
];
const RETRY_FIELDS: Array<keyof RetryPolicy> = ["maxAttempts", "baseDelayMs", "maxDelayMs"];

export default function CrawlerSchedulingPolicy(props: {
	config: CrawlerExecutionConfig;
	onChange: (config: CrawlerExecutionConfig) => void;
}) {
	const t = getComponentT("crawler:settings");
	const tracking = () => ({ ...DEFAULT_TRACKING_POLICY, ...props.config.tracking });
	const update = (key: NumericTrackingKey, value: number) =>
		props.onChange({ ...props.config, tracking: { ...props.config.tracking, [key]: value } });
	return (
		<section class="flex flex-col gap-4">
			<h3 class="ts-label text-primary">{t("scheduling.title")}</h3>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<For each={FIELDS}>
					{(field) => (
						<NumberField
							size="sm"
							label={t(`scheduling.${field.key}`)}
							value={tracking()[field.key] / field.scale}
							min={field.min}
							max={field.max}
							step={
								field.key === "minRegularIntervalHours"
									? 0.5
									: field.scale === 1000
										? 0.1
										: 1
							}
							onChange={(value) => update(field.key, value * field.scale)}
						/>
					)}
				</For>
			</div>
			<Table
				head={
					<tr>
						<th>{t("scheduling.state")}</th>
						<th>{t("scheduling.retry")}</th>
						<th>{t("scheduling.lateness")}</th>
					</tr>
				}
			>
				<For each={STATES}>
					{(row) => (
						<tr>
							<td class="w-1/3">{t(`videos.state.${row.state}`)}</td>
							<td>
								<NumberField
									size="sm"
									aria-label={`${t(`videos.state.${row.state}`)} ${t("scheduling.retry")}`}
									value={tracking()[row.retry] / 1000}
									min={0.1}
									max={row.maxRetry}
									step={0.1}
									onChange={(value) =>
										update(row.retry, Math.round(value * 1000))
									}
								/>
							</td>
							<td>
								<NumberField
									size="sm"
									aria-label={`${t(`videos.state.${row.state}`)} ${t("scheduling.lateness")}`}
									value={tracking()[row.lateness] / 1000}
									min={1}
									max={row.maxLateness}
									onChange={(value) =>
										update(row.lateness, Math.round(value * 1000))
									}
								/>
							</td>
						</tr>
					)}
				</For>
			</Table>
			<h3 class="ts-label text-primary">{t("scheduling.discoveryRetry")}</h3>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<For each={RETRY_FIELDS}>
					{(key) => {
						const scale = key === "maxAttempts" ? 1 : 1000;
						return (
							<NumberField
								size="sm"
								label={t(`scheduling.${key}`)}
								min={key === "maxAttempts" ? 1 : 0.1}
								max={key === "maxAttempts" ? 20 : 86400}
								step={key === "maxAttempts" ? 1 : 0.1}
								value={props.config.discoveryRetry[key] / scale}
								onChange={(value) =>
									props.onChange({
										...props.config,
										discoveryRetry: {
											...props.config.discoveryRetry,
											[key]: Math.round(value * scale),
										},
									})
								}
							/>
						);
					}}
				</For>
			</div>
		</section>
	);
}
