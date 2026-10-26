import { Show } from "solid-js";
import type { HealthConfig } from "@cvsa/contracts";

type NetworkHealthPolicyProps = {
	config: HealthConfig | undefined;
};

export default function NetworkHealthPolicy(props: NetworkHealthPolicyProps) {
	return (
		<Show when={props.config}>
			{(health) => (
				<div class="p-4 rounded border border-border flex flex-col gap-2">
					<h3 class="ts-subhead font-semibold text-primary">Health policy</h3>
					<div class="grid grid-cols-2 md:grid-cols-5 gap-3 ts-caption text-tertiary">
						<div>
							Failure threshold{" "}
							<span class="text-primary">{health().failureThreshold}</span>
						</div>
						<div>
							Cooldown <span class="text-primary">{health().cooldownMs} ms</span>
						</div>
						<div>
							Failure penalty{" "}
							<span class="text-primary">{health().failurePenalty}</span>
						</div>
						<div>
							Recovery bonus{" "}
							<span class="text-primary">{health().recoveryBonus}</span>
						</div>
						<div>
							Min weight factor{" "}
							<span class="text-primary">{health().minWeightFactor}</span>
						</div>
					</div>
				</div>
			)}
		</Show>
	);
}
