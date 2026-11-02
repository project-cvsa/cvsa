import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import {
	CrawlerExecutionConfigSchema,
	type CrawlerExecutionConfig,
	type CrawlerStatusDto,
} from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";
import CrawlerSchedulingPolicy from "./CrawlerSchedulingPolicy";

type Props = {
	config: CrawlerExecutionConfig | undefined;
	status: CrawlerStatusDto | null;
	onChange: (config: CrawlerExecutionConfig) => void;
};
const FIELDS: Array<{
	key: Exclude<keyof CrawlerExecutionConfig, "tracking" | "discoveryRetry">;
	min: number;
	max: number;
}> = [
	{ key: "taskTimeoutMs", min: 1000, max: 240000 },
	{ key: "snapshotConcurrency", min: 1, max: 200 },
	{ key: "discoveryConcurrency", min: 1, max: 100 },
	{ key: "requestTimeoutMs", min: 100, max: 120000 },
	{ key: "queueCap", min: 1, max: 10000 },
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
			</div>
			<CrawlerSchedulingPolicy config={config()} onChange={props.onChange} />
		</section>
	);
}
