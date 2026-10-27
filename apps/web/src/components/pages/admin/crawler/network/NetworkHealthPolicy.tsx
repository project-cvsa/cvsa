import { Show } from "solid-js";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { HealthConfig } from "@cvsa/contracts";
import ShieldCheck from "lucide-solid/icons/shield-check";

type NetworkHealthPolicyProps = {
	config: HealthConfig | undefined;
};

export default function NetworkHealthPolicy(props: NetworkHealthPolicyProps) {
	const t = getComponentT("crawler");

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
						description={t("network.policy.description")}
					/>
					<CardContent>
						<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
							<div class="p-3 rounded-lg border border-border bg-surface-container-low/50 flex flex-col gap-1">
								<span class="text-xs text-tertiary">Failure Threshold</span>
								<span class="text-base font-mono font-semibold text-primary">
									{health().failureThreshold} fails
								</span>
							</div>
							<div class="p-3 rounded-lg border border-border bg-surface-container-low/50 flex flex-col gap-1">
								<span class="text-xs text-tertiary">Cooldown Duration</span>
								<span class="text-base font-mono font-semibold text-primary">
									{health().cooldownMs / 1000}s
								</span>
							</div>
							<div class="p-3 rounded-lg border border-border bg-surface-container-low/50 flex flex-col gap-1">
								<span class="text-xs text-tertiary">Failure Penalty</span>
								<span class="text-base font-mono font-semibold text-amber-600 dark:text-amber-400">
									-{(health().failurePenalty * 100).toFixed(0)}%
								</span>
							</div>
							<div class="p-3 rounded-lg border border-border bg-surface-container-low/50 flex flex-col gap-1">
								<span class="text-xs text-tertiary">Recovery Bonus</span>
								<span class="text-base font-mono font-semibold text-emerald-600 dark:text-emerald-400">
									+{(health().recoveryBonus * 100).toFixed(0)}%
								</span>
							</div>
							<div class="p-3 rounded-lg border border-border bg-surface-container-low/50 flex flex-col gap-1">
								<span class="text-xs text-tertiary">Min Weight Floor</span>
								<span class="text-base font-mono font-semibold text-primary">
									{(health().minWeightFactor * 100).toFixed(0)}%
								</span>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</Show>
	);
}
