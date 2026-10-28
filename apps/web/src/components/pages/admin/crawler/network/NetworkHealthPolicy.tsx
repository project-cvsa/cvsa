import NumberField from "@components/ui/NumberField";
import Slider from "@components/ui/Slider";
import Button from "@components/ui/Button";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { HealthConfig } from "@cvsa/contracts";

type NetworkHealthPolicyProps = {
	config: HealthConfig | undefined;
	onChange: (updated: HealthConfig) => void;
};

const DEFAULT_HEALTH: HealthConfig = {
	failureThreshold: 20,
	cooldownMs: 10_000,
	failurePenalty: 0.85,
	recoveryBonus: 0.5,
	minWeightFactor: 0.1,
};

export default function NetworkHealthPolicy(props: NetworkHealthPolicyProps) {
	const t = getComponentT("crawler");
	const health = () => props.config ?? DEFAULT_HEALTH;
	const update = (partial: Partial<HealthConfig>) => props.onChange({ ...health(), ...partial });
	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 class="ts-heading-3 text-primary">{t("network.policy.title")}</h3>
					<p class="ts-caption text-secondary mt-1">{t("network.policy.description")}</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => props.onChange({ ...DEFAULT_HEALTH })}
				>
					{t("network.policy.reset")}
				</Button>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<NumberField
					label={t("network.policy.failureThreshold")}
					helperText={t("network.policy.failureThresholdHelp")}
					value={health().failureThreshold}
					min={1}
					max={100}
					step={1}
					onChange={(value) =>
						update({ failureThreshold: Math.max(1, Math.min(100, Math.round(value))) })
					}
				/>
				<NumberField
					label={t("network.policy.cooldown")}
					helperText={t("network.policy.cooldownHelp")}
					value={health().cooldownMs / 1000}
					min={1}
					max={3600}
					step={1}
					suffix="s"
					onChange={(value) =>
						update({
							cooldownMs: Math.max(1000, Math.min(3600000, Math.round(value * 1000))),
						})
					}
				/>
				<Slider
					label={t("network.policy.minimumWeight")}
					value={health().minWeightFactor}
					min={0}
					max={0.95}
					step={0.05}
					formatValue={(value) => `${Math.round(value * 100)}%`}
					onChange={(value) => update({ minWeightFactor: value })}
				/>
				<Slider
					label={t("network.policy.failureFactor")}
					value={health().failurePenalty}
					min={0.05}
					max={0.95}
					step={0.05}
					formatValue={(value) => `${Math.round(value * 100)}%`}
					onChange={(value) => update({ failurePenalty: value })}
				/>
				<Slider
					label={t("network.policy.recoveryBonus")}
					value={health().recoveryBonus}
					min={0.05}
					max={0.95}
					step={0.05}
					formatValue={(value) => `+${Math.round(value * 100)}%`}
					onChange={(value) => update({ recoveryBonus: value })}
				/>
			</div>
		</section>
	);
}
