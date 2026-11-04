import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import { CrawlerExecutionConfigSchema, type CrawlerExecutionConfig } from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";
import CrawlerSchedulingPolicy from "./CrawlerSchedulingPolicy";

type Props = {
	config: CrawlerExecutionConfig | undefined;
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
	{ key: "queueCap", min: 1, max: 10000 },
	{ key: "mqOperationTimeoutMs", min: 1000, max: 30000 },
	{ key: "inferenceTimeoutMs", min: 1000, max: 120000 },
];

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
			<CrawlerSchedulingPolicy config={config()} onChange={props.onChange} />
		</section>
	);
}
