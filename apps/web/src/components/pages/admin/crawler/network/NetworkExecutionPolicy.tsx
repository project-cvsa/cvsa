import { For, Show } from "solid-js";
import NumberField from "@components/ui/NumberField";
import Switch from "@components/ui/Switch";
import Select from "@components/ui/Select";
import {
	CrawlerExecutionConfigSchema,
	type CrawlerExecutionConfig,
	type CrawlerStatusDto,
} from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";

type Props = {
	config: CrawlerExecutionConfig | undefined;
	status: CrawlerStatusDto | null;
	onChange: (config: CrawlerExecutionConfig) => void;
};
const FIELDS: Array<{
	key: Exclude<keyof CrawlerExecutionConfig, "throttleScope" | "throttleFailover">;
	min: number;
	max: number;
}> = [
	{ key: "taskTimeoutMs", min: 1000, max: 240000 },
	{ key: "snapshotConcurrency", min: 1, max: 200 },
	{ key: "discoveryConcurrency", min: 1, max: 100 },
	{ key: "requestTimeoutMs", min: 100, max: 120000 },
	{ key: "admissionTimeoutMs", min: 0, max: 10000 },
	{ key: "throttleCooldownMs", min: 100, max: 3600000 },
	{ key: "throttleJitterMs", min: 0, max: 60000 },
	{ key: "queueCap", min: 1, max: 10000 },
	{ key: "maxAdapterAttempts", min: 1, max: 10 },
	{ key: "probeWaitMs", min: 10, max: 5000 },
	{ key: "probeRetryMs", min: 100, max: 60000 },
	{ key: "probeRetries", min: 0, max: 5 },
	{ key: "maxNetworkCooldownMs", min: 1000, max: 3600000 },
	{ key: "mqOperationTimeoutMs", min: 1000, max: 30000 },
	{ key: "inferenceTimeoutMs", min: 1000, max: 120000 },
];

export default function NetworkExecutionPolicy(props: Props) {
	const t = getComponentT("crawler");
	const config = () => CrawlerExecutionConfigSchema.parse(props.config ?? {});
	return (
		<section class="flex flex-col gap-4">
			<h3 class="ts-heading-3 text-primary">{t("network.execution.title")}</h3>
			<p class="ts-caption text-secondary">{t("network.execution.description")}</p>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<For each={FIELDS}>
					{(field) => (
						<NumberField
							size="sm"
							label={t(`network.execution.${field.key}`)}
							helperText={t(`network.execution.${field.key}Help`)}
							min={field.min}
							max={field.max}
							step={1}
							value={config()[field.key]}
							onChange={(value) =>
								props.onChange({
									...config(),
									[field.key]: Math.max(
										field.min,
										Math.min(field.max, Math.round(value))
									),
								})
							}
						/>
					)}
				</For>
				<Select
					size="md"
					label={t("network.execution.throttleScope")}
					value={config().throttleScope}
					options={[
						{ value: "adapter", label: t("network.execution.scopeAdapter") },
						{ value: "request_type", label: t("network.execution.scopeAll") },
					]}
					onValueChange={(value) => {
						if (value === "adapter" || value === "request_type")
							props.onChange({ ...config(), throttleScope: value });
					}}
				/>
			</div>
			<Switch
				checked={config().throttleFailover}
				disabled={config().throttleScope !== "adapter"}
				label={t("network.execution.throttleFailover")}
				onChange={(throttleFailover) => props.onChange({ ...config(), throttleFailover })}
			/>
			<p class="ts-caption text-secondary">{t("network.execution.throttleFailoverHelp")}</p>
			<Show when={props.status?.cooldowns?.length}>
				<div class="flex flex-col gap-2 border border-border p-3">
					<p class="ts-label text-primary">{t("network.execution.cooldowns")}</p>
					<For each={props.status?.cooldowns}>
						{(item) => (
							<p class="ts-caption text-secondary">
								{t("network.execution.reasonUpstream")} · {item.scope} ·{" "}
								{Math.ceil(item.remainingMs / 1000)}s ·{" "}
								{new Date(item.until).toLocaleTimeString()}
							</p>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
