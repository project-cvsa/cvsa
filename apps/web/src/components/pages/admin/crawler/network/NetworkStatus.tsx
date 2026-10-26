import { For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import type { CrawlerStatusDto } from "@cvsa/contracts";

type NetworkStatusProps = {
	status: Accessor<CrawlerStatusDto | null>;
	loading: Accessor<boolean>;
	refresh: () => Promise<void>;
};

export default function NetworkStatus(props: NetworkStatusProps) {
	return (
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<h3 class="ts-subhead font-semibold text-primary">Runtime adapters</h3>
				<Button
					size="sm"
					variant="outlined"
					disabled={props.loading()}
					onClick={() => void props.refresh()}
				>
					{props.loading() ? "Refreshing" : "Refresh"}
				</Button>
			</div>
			<Show
				when={props.status()}
				fallback={
					<div class="p-6 text-center text-tertiary border border-border rounded">
						{props.loading() ? "Loading" : "No status"}
					</div>
				}
			>
				{(status) => (
					<div class="overflow-x-auto border border-border rounded">
						<table class="w-full text-left ts-caption">
							<thead>
								<tr class="border-b border-border text-tertiary">
									<th class="py-2 px-3">ID</th>
									<th class="py-2 px-3">State</th>
									<th class="py-2 px-3">Health</th>
									<th class="py-2 px-3">Weight</th>
									<th class="py-2 px-3">Failures</th>
								</tr>
							</thead>
							<tbody>
								<For each={status().adapters}>
									{(adapter) => (
										<tr class="border-b border-border hover:bg-hover">
											<td class="py-2 px-3 font-mono font-medium text-primary">
												{adapter.id}
											</td>
											<td class="py-2 px-3 font-mono">
												{adapter.healthState}
											</td>
											<td class="py-2 px-3">
												{Math.round(adapter.healthFactor * 100)}%
											</td>
											<td class="py-2 px-3">{adapter.effectiveWeight}</td>
											<td class="py-2 px-3">{adapter.consecutiveFailures}</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
				)}
			</Show>
		</div>
	);
}
