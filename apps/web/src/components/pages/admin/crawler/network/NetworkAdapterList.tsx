import { createEffect, createSignal, For, Show } from "solid-js";
import clsx from "clsx";
import Button from "@components/ui/Button";
import Badge, { type BadgeVariant } from "@components/ui/Badge";
import Switch from "@components/ui/Switch";
import { Card, CardContent, CardHeader } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	CrawlerStatusDto,
	NetworkAdapterConfig,
	TestNetworkAdapterResponse,
} from "@cvsa/contracts";

type NetworkAdapterListProps = {
	adapters: NetworkAdapterConfig[];
	status: CrawlerStatusDto | null;
	configRevision: number;
	dirty: boolean;
	onToggle: (id: string) => void;
	onRemove: (id: string) => void;
	onEdit: (adapter: NetworkAdapterConfig) => void;
	onAdd: () => void;
};

function healthPresentation(item: CrawlerStatusDto["adapters"][number]): {
	variant: BadgeVariant;
	label: string;
} {
	if (!item.enabled) return { variant: "neutral", label: "network.adapters.health.disabled" };
	switch (item.healthState) {
		case "healthy":
			return { variant: "success", label: "network.adapters.health.healthy" };
		case "degraded":
			return { variant: "warning", label: "network.adapters.health.degraded" };
		case "half-open":
			return { variant: "warning", label: "network.adapters.health.probing" };
		case "open":
			return { variant: "danger", label: "network.adapters.health.open" };
		default:
			return { variant: "neutral", label: "common.unknown" };
	}
}

export default function NetworkAdapterList(props: NetworkAdapterListProps) {
	const t = getComponentT("crawler");
	const [testing, setTesting] = createSignal<Record<string, boolean>>({});
	const [results, setResults] = createSignal<Record<string, TestNetworkAdapterResponse>>({});
	const staleRuntime = () => props.status?.revision !== props.configRevision;
	createEffect(() => {
		props.status?.revision;
		props.dirty;
		setResults({});
	});

	const test = async (id: string) => {
		setTesting((current) => ({ ...current, [id]: true }));
		const result = await api.crawler.testNetworkAdapter(id);
		setTesting((current) => ({ ...current, [id]: false }));
		if (!result.ok || !result.data) {
			toast.error(result.ok ? t("common.error") : result.error.message || t("common.error"));
			return;
		}
		const data = result.data;
		setResults((current) => ({ ...current, [id]: data }));
	};

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<h3 class="ts-heading-3 text-primary">{t("network.adapters.title")}</h3>
					<Badge variant="neutral" size="sm">
						{props.adapters.length}
					</Badge>
				</div>
				<Button size="sm" variant="filled" onClick={props.onAdd}>
					{t("common.add")}
				</Button>
			</div>

			<Show when={props.dirty}>
				<div class="px-3 py-2 text-xs bg-warning/10 text-warning border border-warning/30">
					{t("network.adapters.saveBeforeTest")}
				</div>
			</Show>

			<Show
				when={props.adapters.length}
				fallback={
					<p class="text-secondary py-8 text-center">{t("network.adapters.empty")}</p>
				}
			>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<For each={props.adapters}>
						{(adapter) => {
							const runtime = () =>
								props.status?.adapters.find((item) => item.id === adapter.id);
							const result = () => results()[adapter.id];
							return (
								<Card class="flex flex-col">
									<CardHeader
										variant="bordered"
										title={
											<div class="flex items-center gap-2.5 min-w-0">
												<Switch
													size="sm"
													checked={adapter.enabled}
													onChange={() => props.onToggle(adapter.id)}
													aria-label={`${t("common.enable")} ${adapter.id}`}
												/>
												<span class="font-semibold text-primary truncate text-sm">
													{adapter.id}
												</span>
												<span class="text-xs text-tertiary font-normal">
													{t(
														adapter.type === "direct"
															? "network.adapters.type.direct"
															: "network.adapters.type.proxy"
													)}
												</span>
											</div>
										}
										actions={
											<Show when={runtime()}>
												{(item) => (
													<Badge
														size="sm"
														variant={healthPresentation(item()).variant}
													>
														{t(healthPresentation(item()).label)}
													</Badge>
												)}
											</Show>
										}
									/>
									<CardContent class="p-4 flex flex-col gap-4 flex-1 justify-between">
										<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
											<div>
												<span class="text-tertiary block mb-0.5">
													{t("network.adapters.col.weight")}
												</span>
												<span class="font-medium text-primary">
													{adapter.baseWeight}
												</span>
											</div>
											<div>
												<span class="text-tertiary block mb-0.5">
													{t("network.adapters.effectiveWeight")}
												</span>
												<span class="font-medium text-primary">
													{runtime()?.effectiveWeight != null
														? runtime()?.effectiveWeight.toFixed(2)
														: "—"}
												</span>
											</div>
											<div>
												<span class="text-tertiary block mb-0.5">
													{t("network.adapters.col.rateLimit")}
												</span>
												<span class="font-medium text-primary truncate block">
													{adapter.rateLimits.length
														? adapter.rateLimits
																.map(
																	(l) =>
																		`${l.maxRequests}/${l.durationSeconds}s`
																)
																.join(", ")
														: t("common.unlimited")}
												</span>
											</div>
											<div>
												<span class="text-tertiary block mb-0.5">
													{t("network.adapters.requests")}
												</span>
												<span class="font-medium text-primary">
													{runtime()?.requests ?? 0}
													<Show when={runtime()?.failures}>
														<span class="text-error ml-1">
															({runtime()?.failures} err)
														</span>
													</Show>
												</span>
											</div>
											<div>
												<span class="text-tertiary block mb-0.5">
													{t("network.adapters.averageLatency")}
												</span>
												<span class="font-medium text-primary">
													{runtime()?.averageDurationMs == null
														? "—"
														: `${runtime()?.averageDurationMs?.toFixed(0)} ms`}
												</span>
											</div>
											<Show when={result()}>
												{(item) => (
													<div>
														<span class="text-tertiary block mb-0.5">
															{t("network.adapters.latency")}
														</span>
														<span
															class={clsx(
																"font-medium",
																item().ok
																	? "text-success"
																	: "text-error"
															)}
														>
															{item().ok
																? `${item().latencyMs} ms`
																: item().error || t("common.error")}
														</span>
													</div>
												)}
											</Show>
										</div>

										<div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
											<Button
												size="sm"
												variant="outlined"
												disabled={
													props.dirty ||
													staleRuntime() ||
													testing()[adapter.id]
												}
												onClick={() => void test(adapter.id)}
											>
												{testing()[adapter.id]
													? t("network.adapters.testing")
													: t("common.test")}
											</Button>
											<Button
												size="sm"
												variant="outlined"
												onClick={() => props.onEdit(adapter)}
											>
												{t("common.edit")}
											</Button>
											<Button
												size="sm"
												variant="outlined"
												class="text-error border-error/30 hover:border-error hover:bg-error/10"
												onClick={() => props.onRemove(adapter.id)}
											>
												{t("common.delete")}
											</Button>
										</div>
									</CardContent>
								</Card>
							);
						}}
					</For>
				</div>
			</Show>
		</section>
	);
}
