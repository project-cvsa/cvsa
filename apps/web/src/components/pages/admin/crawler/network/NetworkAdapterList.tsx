import { For, Show } from "solid-js";
import Button from "@components/ui/Button";
import type { CrawlerStatusDto, NetworkAdapterConfig } from "@cvsa/contracts";

type NetworkAdapterListProps = {
	adapters: NetworkAdapterConfig[];
	status: CrawlerStatusDto | null;
	onToggle: (id: string) => void;
	onRemove: (id: string) => void;
	onWeightChange: (id: string, weight: number) => void;
};

export default function NetworkAdapterList(props: NetworkAdapterListProps) {
	const endpoint = (adapter: NetworkAdapterConfig) =>
		adapter.type === "http-proxy" ? adapter.proxyUrl : "direct";

	return (
		<div class="flex flex-col gap-3">
			<h3 class="ts-subhead font-semibold text-primary">
				Adapters ({props.adapters.length})
			</h3>
			<Show
				when={props.adapters.length > 0}
				fallback={
					<div class="p-8 text-center text-tertiary border border-border rounded">
						No adapters
					</div>
				}
			>
				<div class="overflow-x-auto">
					<table class="w-full text-left ts-caption">
						<thead>
							<tr class="border-b border-border text-tertiary">
								<th class="py-2 px-3">Enabled</th>
								<th class="py-2 px-3">ID</th>
								<th class="py-2 px-3">Type</th>
								<th class="py-2 px-3">Endpoint</th>
								<th class="py-2 px-3">Weight</th>
								<th class="py-2 px-3">Rate limit</th>
								<th class="py-2 px-3">Health</th>
								<th class="py-2 px-3">Action</th>
							</tr>
						</thead>
						<tbody>
							<For each={props.adapters}>
								{(adapter) => {
									const runtime = () =>
										props.status?.adapters.find(
											(item) => item.id === adapter.id
										);
									return (
										<tr class="border-b border-border hover:bg-hover">
											<td class="py-2 px-3">
												<input
													type="checkbox"
													checked={adapter.enabled}
													aria-label={"Enable " + adapter.id}
													onChange={() => props.onToggle(adapter.id)}
												/>
											</td>
											<td class="py-2 px-3 font-mono font-medium text-primary">
												{adapter.id}
											</td>
											<td class="py-2 px-3">{adapter.type}</td>
											<td class="py-2 px-3 font-mono text-tertiary">
												{endpoint(adapter)}
											</td>
											<td class="py-2 px-3">
												<input
													type="number"
													min="0.1"
													step="0.1"
													aria-label={"Weight " + adapter.id}
													class="h-8 w-20 px-2 border border-border rounded text-primary bg-transparent text-sm"
													value={adapter.baseWeight}
													onInput={(event) =>
														props.onWeightChange(
															adapter.id,
															Number.parseFloat(
																event.currentTarget.value
															) || 1
														)
													}
												/>
											</td>
											<td class="py-2 px-3 text-tertiary">
												{adapter.rateLimits.length > 0
													? adapter.rateLimits
															.map(
																(limit) =>
																	limit.maxRequests +
																	"/" +
																	limit.durationSeconds +
																	"s"
															)
															.join(", ")
													: "Unlimited"}
											</td>
											<td class="py-2 px-3">
												<Show
													when={runtime()}
													fallback={
														<span class="text-tertiary">
															Not loaded
														</span>
													}
												>
													{(item) => (
														<span
															class={
																item().healthState.toLowerCase() ===
																"healthy"
																	? "text-green-600"
																	: "text-red-600"
															}
														>
															{item().healthState} ·{" "}
															{item().effectiveWeight.toFixed(2)}
														</span>
													)}
												</Show>
											</td>
											<td class="py-2 px-3">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => props.onRemove(adapter.id)}
												>
													Remove
												</Button>
											</td>
										</tr>
									);
								}}
							</For>
						</tbody>
					</table>
				</div>
			</Show>
		</div>
	);
}
