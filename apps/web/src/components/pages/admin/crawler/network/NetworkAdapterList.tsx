import { For, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Switch from "@components/ui/Switch";
import NumberField from "@components/ui/NumberField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { CrawlerStatusDto, NetworkAdapterConfig } from "@cvsa/contracts";
import Trash2 from "lucide-solid/icons/trash-2";
import Server from "lucide-solid/icons/server";

type NetworkAdapterListProps = {
	adapters: NetworkAdapterConfig[];
	status: CrawlerStatusDto | null;
	onToggle: (id: string) => void;
	onRemove: (id: string) => void;
	onWeightChange: (id: string, weight: number) => void;
};

export default function NetworkAdapterList(props: NetworkAdapterListProps) {
	const t = getComponentT("crawler");

	const endpoint = (adapter: NetworkAdapterConfig) =>
		adapter.type === "http-proxy" ? adapter.proxyUrl : "direct";

	return (
		<Card>
			<CardHeader
				title={
					<div class="flex items-center gap-2">
						<Server class="w-4 h-4 text-primary" />
						<span>{t("network.adapters.title")}</span>
						<Badge variant="neutral" size="sm">
							{t("network.adapters.count").replace(
								"{count}",
								String(props.adapters.length)
							)}
						</Badge>
					</div>
				}
			/>
			<CardContent class="p-0">
				<Show
					when={props.adapters.length > 0}
					fallback={
						<div class="p-8 text-center text-tertiary">
							{t("network.adapters.empty")}
						</div>
					}
				>
					<div class="overflow-x-auto">
						<table class="w-full text-left ts-caption">
							<thead>
								<tr class="border-b border-border text-tertiary bg-surface-container-low/50">
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.enabled")}
									</th>
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.id")}
									</th>
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.type")}
									</th>
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.endpoint")}
									</th>
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.weight")}
									</th>
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.rateLimit")}
									</th>
									<th class="py-3 px-4 font-medium">
										{t("network.adapters.col.health")}
									</th>
									<th class="py-3 px-4 font-medium text-right">
										{t("network.adapters.col.action")}
									</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								<For each={props.adapters}>
									{(adapter) => {
										const runtime = () =>
											props.status?.adapters.find(
												(item) => item.id === adapter.id
											);

										return (
											<tr class="hover:bg-hover/50 transition-colors">
												<td class="py-3 px-4">
													<Switch
														checked={adapter.enabled}
														onChange={() => props.onToggle(adapter.id)}
														aria-label={
															t("common.enable") + " " + adapter.id
														}
													/>
												</td>
												<td class="py-3 px-4 font-mono font-medium text-primary">
													{adapter.id}
												</td>
												<td class="py-3 px-4">
													<Badge
														variant={
															adapter.type === "http-proxy"
																? "info"
																: "neutral"
														}
														size="sm"
													>
														{adapter.type === "http-proxy"
															? t("network.adapters.type.proxy")
															: t("network.adapters.type.direct")}
													</Badge>
												</td>
												<td
													class="py-3 px-4 font-mono text-tertiary max-w-xs truncate"
													title={endpoint(adapter)}
												>
													{endpoint(adapter)}
												</td>
												<td class="py-3 px-4">
													<div class="w-24">
														<NumberField
															size="sm"
															min={0.1}
															step={0.1}
															value={adapter.baseWeight}
															onChange={(val) =>
																props.onWeightChange(
																	adapter.id,
																	val
																)
															}
															aria-label={
																t("network.adapters.col.weight") +
																" " +
																adapter.id
															}
														/>
													</div>
												</td>
												<td class="py-3 px-4 text-tertiary">
													{adapter.rateLimits.length > 0 ? (
														<Badge variant="neutral" size="sm">
															{adapter.rateLimits
																.map(
																	(limit) =>
																		`${limit.maxRequests} req / ${limit.durationSeconds}s`
																)
																.join(", ")}
														</Badge>
													) : (
														<span class="text-tertiary text-xs">
															{t("common.unlimited")}
														</span>
													)}
												</td>
												<td class="py-3 px-4">
													<Show
														when={runtime()}
														fallback={
															<Badge variant="neutral" size="sm">
																{t("common.unknown")}
															</Badge>
														}
													>
														{(item) => {
															const state = () =>
																item().healthState.toLowerCase();
															return (
																<div class="flex flex-col gap-0.5">
																	<Show
																		when={state() === "healthy"}
																		fallback={
																			<Show
																				when={
																					state() ===
																					"degraded"
																				}
																				fallback={
																					<Badge
																						variant="danger"
																						size="sm"
																						dot
																					>
																						{t(
																							"network.adapters.health.open"
																						)}
																					</Badge>
																				}
																			>
																				<Badge
																					variant="warning"
																					size="sm"
																					dot
																				>
																					{t(
																						"network.adapters.health.degraded"
																					)}
																				</Badge>
																			</Show>
																		}
																	>
																		<Badge
																			variant="success"
																			size="sm"
																			dot
																		>
																			{t(
																				"network.adapters.health.healthy"
																			)}
																		</Badge>
																	</Show>
																	<span class="text-[11px] font-mono text-tertiary">
																		eff:{" "}
																		{item().effectiveWeight.toFixed(
																			2
																		)}
																		{item()
																			.consecutiveFailures >
																			0 &&
																			` (${item().consecutiveFailures} fail)`}
																	</span>
																</div>
															);
														}}
													</Show>
												</td>
												<td class="py-3 px-4 text-right">
													<Button
														size="sm"
														variant="ghost"
														class="text-error hover:bg-error/10 gap-1"
														onClick={() => props.onRemove(adapter.id)}
													>
														<Trash2 class="w-3.5 h-3.5" />
														<span>{t("common.delete")}</span>
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
			</CardContent>
		</Card>
	);
}
