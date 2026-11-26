import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import Switch from "@components/ui/Switch";
import { CrawlerExecutionConfigSchema, type CrawlerExecutionConfig } from "@cvsa/contracts";
import { cn } from "@lib/cn";
import { getComponentT } from "@lib/i18n/isomorphic";
import { cva } from "class-variance-authority";
import CrawlerSchedulingPolicy from "./CrawlerSchedulingPolicy";

type Props = {
	config: CrawlerExecutionConfig | undefined;
	onChange: (config: CrawlerExecutionConfig) => void;
};
type NumericExecutionField = {
	[K in keyof CrawlerExecutionConfig]: CrawlerExecutionConfig[K] extends number ? K : never;
}[keyof CrawlerExecutionConfig];
type BooleanExecutionField = {
	[K in keyof CrawlerExecutionConfig]: CrawlerExecutionConfig[K] extends boolean ? K : never;
}[keyof CrawlerExecutionConfig];

const FIELDS: Array<{
	key: NumericExecutionField;
	min: number;
	max: number;
}> = [
	{ key: "taskTimeoutMs", min: 1000, max: 240000 },
	{ key: "requestTimeoutMs", min: 100, max: 120000 },
	{ key: "snapshotConcurrency", min: 1, max: 200 },
	{ key: "discoveryConcurrency", min: 1, max: 100 },
	{ key: "queueCap", min: 1, max: 10000 },
	{ key: "mqOperationTimeoutMs", min: 1000, max: 30000 },
	{ key: "inferenceTimeoutMs", min: 1000, max: 120000 },
];

const DISCOVERY_FLAGS: readonly BooleanExecutionField[] = [
	"searchRoverEnabled",
	"relatedDiscoveryEnabled",
	"hotSamplingEnabled",
	"autoMetadataRefreshEnabled",
];

const flagCardVariants = cva(
	"flex items-center justify-between gap-4 border border-border px-3.5 py-3 transition-colors",
	{
		variants: {
			enabled: {
				true: "bg-surface",
				false: "bg-surface-container-low",
			},
		},
		defaultVariants: {
			enabled: true,
		},
	}
);

export default function CrawlerExecutionPolicy(props: Props) {
	const t = getComponentT("crawler:network");
	const config = () => CrawlerExecutionConfigSchema.parse(props.config ?? {});
	return (
		<section class="flex flex-col gap-4">
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<For each={FIELDS}>
					{(field) => (
						<NumberField
							size="sm"
							label={t(`network.execution.${field.key}`)}
							min={field.min / (field.key.endsWith("Ms") ? 1000 : 1)}
							max={field.max / (field.key.endsWith("Ms") ? 1000 : 1)}
							step={field.key.endsWith("Ms") ? 0.1 : 1}
							value={config()[field.key] / (field.key.endsWith("Ms") ? 1000 : 1)}
							onChange={(value) =>
								props.onChange({
									...config(),
									[field.key]: Math.max(
										field.min,
										Math.min(
											field.max,
											Math.round(
												value * (field.key.endsWith("Ms") ? 1000 : 1)
											)
										)
									),
								})
							}
						/>
					)}
				</For>
			</div>
			<div class="flex flex-col gap-3">
				<h4 class="ts-label text-primary">{t("network.execution.runtimeFlags")}</h4>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<For each={DISCOVERY_FLAGS}>
						{(flag) => {
							const enabled = () => config()[flag];
							return (
								<div class={cn(flagCardVariants({ enabled: enabled() }))}>
									<div class="flex flex-col gap-0.5 min-w-0">
										<span class="ts-label font-medium text-primary">
											{t(`network.execution.${flag}`)}
										</span>
										<span class="ts-caption text-secondary">
											{t(`network.execution.${flag}Help`)}
										</span>
									</div>
									<Switch
										size="sm"
										checked={enabled()}
										aria-label={t(`network.execution.${flag}`)}
										onChange={(checked) =>
											props.onChange({
												...config(),
												[flag]: checked,
											})
										}
									/>
								</div>
							);
						}}
					</For>
				</div>
			</div>
			<CrawlerSchedulingPolicy config={config()} onChange={props.onChange} />
		</section>
	);
}
