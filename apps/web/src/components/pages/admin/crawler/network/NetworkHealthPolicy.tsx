import { Show } from "solid-js";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import NumberField from "@components/ui/NumberField";
import Slider from "@components/ui/Slider";
import Button from "@components/ui/Button";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { HealthConfig } from "@cvsa/contracts";
import ShieldCheck from "lucide-solid/icons/shield-check";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

type NetworkHealthPolicyProps = {
	config: HealthConfig | undefined;
	onChange?: (updated: HealthConfig) => void;
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

	const update = (partial: Partial<HealthConfig>) => {
		if (!props.config || !props.onChange) return;
		props.onChange({
			...props.config,
			...partial,
		});
	};

	const resetToDefaults = () => {
		if (!props.onChange) return;
		props.onChange({ ...DEFAULT_HEALTH });
	};

	return (
		<Show when={props.config}>
			{(health) => (
				<Card>
					<CardHeader
						title={
							<div class="flex items-center gap-2">
								<ShieldCheck class="w-4 h-4 text-primary" />
								<span>{t("network.policy.title")}</span>
							</div>
						}
						description="节点熔断与权重惩罚策略。适度调高容错阈值可避免代理因偶发性风控立即全池停用"
						actions={
							<Button
								variant="ghost"
								size="sm"
								onClick={resetToDefaults}
								class="gap-1.5 text-xs uppercase"
							>
								<RotateCcw class="w-3.5 h-3.5" />
								<span>恢复推荐策略</span>
							</Button>
						}
					/>
					<CardContent>
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
							{/* Failure Threshold */}
							<div class="p-3 border border-border bg-surface-container-low flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-primary">
										连续故障阈值
									</span>
									<span class="text-xs text-tertiary">
										{health().failureThreshold} 次
									</span>
								</div>
								<p class="text-caption text-tertiary text-xs leading-normal">
									单一节点连续网络超时或严重错误达到此次数时触发熔断冷却
								</p>
								<NumberField
									value={health().failureThreshold}
									min={1}
									max={100}
									step={1}
									size="sm"
									onChange={(val) =>
										update({ failureThreshold: Math.max(1, Math.round(val)) })
									}
								/>
							</div>

							{/* Cooldown Duration */}
							<div class="p-3 border border-border bg-surface-container-low flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-primary">
										熔断冷却时间
									</span>
									<span class="text-xs text-tertiary">
										{(health().cooldownMs / 1000).toFixed(0)} 秒
									</span>
								</div>
								<p class="text-caption text-tertiary text-xs leading-normal">
									熔断后暂停调度该节点的时间窗口，到期后进入半开状态探测恢复
								</p>
								<NumberField
									value={Math.round(health().cooldownMs / 1000)}
									min={1}
									max={300}
									step={1}
									size="sm"
									onChange={(val) =>
										update({
											cooldownMs: Math.max(1000, Math.round(val * 1000)),
										})
									}
								/>
							</div>

							{/* Min Weight Factor */}
							<div class="p-3 border border-border bg-surface-container-low flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-primary">
										降权保底系数
									</span>
									<span class="text-xs text-tertiary">
										{(health().minWeightFactor * 100).toFixed(0)}%
									</span>
								</div>
								<p class="text-caption text-tertiary text-xs leading-normal">
									节点降权后的最低有效权重比例，防止权重降至 0 彻底无法调度
								</p>
								<Slider
									value={health().minWeightFactor}
									min={0.05}
									max={0.5}
									step={0.05}
									formatValue={(val) => `${(val * 100).toFixed(0)}%`}
									onChange={(val) => update({ minWeightFactor: val })}
								/>
							</div>

							{/* Failure Penalty */}
							<div class="p-3 border border-border bg-surface-container-low flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-primary">
										单次故障惩罚
									</span>
									<span class="text-xs text-error">
										-{(health().failurePenalty * 100).toFixed(0)}%
									</span>
								</div>
								<p class="text-caption text-tertiary text-xs leading-normal">
									每次非致命请求失败对节点有效权重的乘算削减幅度
								</p>
								<Slider
									value={health().failurePenalty}
									min={0.1}
									max={0.95}
									step={0.05}
									formatValue={(val) => `-${(val * 100).toFixed(0)}%`}
									onChange={(val) => update({ failurePenalty: val })}
								/>
							</div>

							{/* Recovery Bonus */}
							<div class="p-3 border border-border bg-surface-container-low flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-xs font-semibold text-primary">
										单次恢复奖励
									</span>
									<span class="text-xs text-success">
										+{(health().recoveryBonus * 100).toFixed(0)}%
									</span>
								</div>
								<p class="text-caption text-tertiary text-xs leading-normal">
									半开状态下每次成功请求向原始基准权重递增恢复的幅度
								</p>
								<Slider
									value={health().recoveryBonus}
									min={0.1}
									max={1.0}
									step={0.05}
									formatValue={(val) => `+${(val * 100).toFixed(0)}%`}
									onChange={(val) => update({ recoveryBonus: val })}
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</Show>
	);
}
