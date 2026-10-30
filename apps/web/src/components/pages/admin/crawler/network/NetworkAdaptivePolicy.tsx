import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import Switch from "@components/ui/Switch";
import { AdaptiveRateConfigSchema, type AdaptiveRateConfig } from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";

type Props = { config?: AdaptiveRateConfig; onChange: (config: AdaptiveRateConfig) => void };
const FIELDS: Array<{
	key: Exclude<keyof AdaptiveRateConfig, "enabled">;
	min: number;
	max: number;
	scale: number;
}> = [
	{ key: "minFactor", min: 1, max: 100, scale: 0.01 },
	{ key: "decreaseFactor", min: 1, max: 99, scale: 0.01 },
	{ key: "recoveryStep", min: 1, max: 100, scale: 0.01 },
	{ key: "recoverySuccesses", min: 1, max: 1000, scale: 1 },
	{ key: "backgroundFactor", min: 1, max: 100, scale: 0.01 },
	{ key: "backgroundPenaltyMs", min: 0, max: 3600, scale: 1000 },
];
export default function NetworkAdaptivePolicy(props: Props) {
	const t = getComponentT("crawler");
	const config = () => AdaptiveRateConfigSchema.parse(props.config ?? {});
	return (
		<section class="flex flex-col gap-4">
			<h3 class="ts-heading-3 text-primary">{t("network.adaptive.title")}</h3>
			<p class="ts-caption text-secondary">{t("network.adaptive.description")}</p>
			<Switch
				checked={config().enabled}
				label={t("common.enable")}
				onChange={(enabled) => props.onChange({ ...config(), enabled })}
			/>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<For each={FIELDS}>
					{(field) => (
						<NumberField
							size="sm"
							label={t(`network.adaptive.${field.key}`)}
							value={Math.round(config()[field.key] / field.scale)}
							min={field.min}
							max={field.max}
							step={1}
							onChange={(value) =>
								props.onChange({
									...config(),
									[field.key]:
										Math.max(
											field.min,
											Math.min(field.max, Math.round(value))
										) * field.scale,
								})
							}
						/>
					)}
				</For>
			</div>
		</section>
	);
}
