import NumberField from "@components/ui/NumberField";
import Slider from "@components/ui/Slider";
import Button from "@components/ui/Button";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { HealthConfig } from "@cvsa/contracts";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

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
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="ts-heading-3 text-primary">{t("network.policy.title")}</h3>
					<p class="ts-caption text-secondary mt-1">{t("network.policy.description")}</p>
				</div>
				<Button
					variant="outlined"
					size="sm"
					onClick={() => props.onChange({ ...DEFAULT_HEALTH })}
					class="gap-1.5"
				>
					<RotateCcw class="w-3.5 h-3.5" />
					<span>{t("network.policy.reset")}</span>
				</Button>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Card 1: Circuit breaker & isolation */}
				<div class="border border-border bg-surface p-4 flex flex-col gap-4">
					<div class="border-b border-border pb-2">
						<h4 class="text-xs uppercase tracking-wider font-semibold text-primary">
							熔断判定与隔离探测
						</h4>
						<span class="text-xs text-tertiary">
							遇限流立即暂停；其他连续故障达到阈值后熔断隔离
						</span>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<NumberField
							size="sm"
							label={t("network.policy.failureThreshold")}
							value={health().failureThreshold}
							min={1}
							max={100}
							step={1}
							suffix="次"
							onChange={(value) =>
								update({
									failureThreshold: Math.max(1, Math.min(100, Math.round(value))),
								})
							}
						/>
						<NumberField
							size="sm"
							label={t("network.policy.cooldown")}
							value={health().cooldownMs / 1000}
							min={1}
							max={3600}
							step={1}
							suffix="s"
							onChange={(value) =>
								update({
									cooldownMs: Math.max(
										1000,
										Math.min(3600000, Math.round(value * 1000))
									),
								})
							}
						/>
					</div>
				</div>

				{/* Card 2: Dynamic weight adjustment */}
				<div class="border border-border bg-surface p-4 flex flex-col gap-4">
					<div class="border-b border-border pb-2">
						<h4 class="text-xs uppercase tracking-wider font-semibold text-primary">
							动态权重衰减与阶梯恢复
						</h4>
						<span class="text-xs text-tertiary">
							根据连续请求成败实时缩放分流承载能力
						</span>
					</div>

					<div class="flex flex-col gap-3">
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
				</div>
			</div>
		</section>
	);
}
