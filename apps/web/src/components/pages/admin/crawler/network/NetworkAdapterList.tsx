import { createSignal, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Switch from "@components/ui/Switch";
import NumberField from "@components/ui/NumberField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	CrawlerStatusDto,
	NetworkAdapterConfig,
	TestNetworkAdapterResponse,
} from "@cvsa/contracts";
import Trash2 from "lucide-solid/icons/trash-2";
import Server from "lucide-solid/icons/server";
import Activity from "lucide-solid/icons/activity";

type NetworkAdapterListProps = {
	adapters: NetworkAdapterConfig[];
	status: CrawlerStatusDto | null;
	onToggle: (id: string) => void;
	onRemove: (id: string) => void;
	onWeightChange: (id: string, weight: number) => void;
};

export default function NetworkAdapterList(props: NetworkAdapterListProps) {
	const t = getComponentT("crawler");

	const [testingIds, setTestingIds] = createSignal<Record<string, boolean>>({});
	const [testResults, setTestResults] = createSignal<Record<string, TestNetworkAdapterResponse>>(
		{}
	);

	const handleTest = async (id: string) => {
		setTestingIds((prev) => ({ ...prev, [id]: true }));
		const res = await api.crawler.testNetworkAdapter(id);
		setTestingIds((prev) => ({ ...prev, [id]: false }));

		if (res.ok && res.data) {
			const data = res.data;
			setTestResults((prev) => ({ ...prev, [id]: data }));
			if (data.ok) {
				toast.success(`[${id}] 探测成功: ${data.latencyMs}ms (${data.status ?? 200})`);
			} else {
				toast.error(`[${id}] 探测异常: ${data.error || "网络不可达"}`);
			}
			return;
		}

		toast.error(res.ok ? t("common.error") : res.error.message || "测试请求发送失败");
	};

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
						<div class="p-8 text-center text-tertiary text-sm">
							{t("network.adapters.empty")}
						</div>
					}
				>
					<div class="overflow-x-auto">
						<table class="w-full text-left ts-caption">
							<thead>
								<tr class="border-b border-border text-tertiary bg-surface-container-high">
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.enabled")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.id")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.type")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.endpoint")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.weight")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.rateLimit")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">
										{t("network.adapters.col.health")}
									</th>
									<th class="py-2.5 px-4 uppercase text-xs">实测延迟</th>
									<th class="py-2.5 px-4 uppercase text-xs text-right">
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
										const isTesting = () => testingIds()[adapter.id] ?? false;
										const testResult = () => testResults()[adapter.id];

										return (
											<tr class="hover:bg-hover transition-colors">
												<td class="py-3 px-4">
													<Switch
														checked={adapter.enabled}
														onChange={() => props.onToggle(adapter.id)}
														aria-label={
															t("common.enable") + " " + adapter.id
														}
													/>
												</td>
												<td class="py-3 px-4 font-semibold text-primary">
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
													class="py-3 px-4 text-tertiary max-w-xs truncate text-xs"
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
																	<span class="text-[11px] text-tertiary">
																		有效权重:{" "}
																		{item().effectiveWeight.toFixed(
																			2
																		)}
																		{item()
																			.consecutiveFailures >
																			0 &&
																			` (${item().consecutiveFailures} 次失败)`}
																	</span>
																</div>
															);
														}}
													</Show>
												</td>
												{/* Live Latency Probe */}
												<td class="py-3 px-4">
													<Show
														when={testResult()}
														fallback={
															<span class="text-tertiary text-xs">
																未测试
															</span>
														}
													>
														{(res) => (
															<Show
																when={res().ok}
																fallback={
																	<span
																		class="text-xs text-error font-semibold truncate block max-w-[120px]"
																		title={res().error}
																	>
																		失败 (
																		{res().status ?? "ERR"})
																	</span>
																}
															>
																<span class="text-xs text-success font-semibold">
																	{res().latencyMs}ms (
																	{res().status ?? 200})
																</span>
															</Show>
														)}
													</Show>
												</td>
												{/* Actions */}
												<td class="py-3 px-4 text-right">
													<div class="flex items-center justify-end gap-1.5">
														<Button
															size="sm"
															variant="outlined"
															disabled={isTesting()}
															class="gap-1 text-xs"
															onClick={() =>
																void handleTest(adapter.id)
															}
														>
															<Activity
																class={
																	"w-3.5 h-3.5 " +
																	(isTesting()
																		? "animate-spin text-primary"
																		: "text-tertiary")
																}
															/>
															<span>
																{isTesting() ? "测速中" : "测速"}
															</span>
														</Button>
														<Button
															size="sm"
															variant="ghost"
															class="text-error hover:bg-hover gap-1 text-xs"
															onClick={() =>
																props.onRemove(adapter.id)
															}
														>
															<Trash2 class="w-3.5 h-3.5" />
															<span>{t("common.delete")}</span>
														</Button>
													</div>
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
