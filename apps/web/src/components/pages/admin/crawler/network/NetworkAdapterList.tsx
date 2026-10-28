import { createEffect, createSignal, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge, { type BadgeVariant } from "@components/ui/Badge";
import Switch from "@components/ui/Switch";
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
				<h3 class="ts-heading-3 text-primary">
					{t("network.adapters.title")}{" "}
					<span class="ts-caption text-tertiary">{props.adapters.length}</span>
				</h3>
				<Button size="sm" variant="filled" onClick={props.onAdd}>
					{t("network.adapters.add")}
				</Button>
			</div>
			<p class="ts-caption text-secondary">
				{props.dirty
					? t("network.adapters.saveBeforeTest")
					: staleRuntime()
						? t("network.adapters.runtimePending")
						: t("network.adapters.statisticsScope")}
			</p>
			<Show
				when={props.adapters.length}
				fallback={<p class="text-secondary">{t("network.adapters.empty")}</p>}
			>
				<div class="flex flex-col divide-y divide-border border-y border-border">
					<For each={props.adapters}>
						{(adapter) => {
							const runtime = () =>
								props.status?.adapters.find((item) => item.id === adapter.id);
							const result = () => results()[adapter.id];
							return (
								<article class="flex flex-col gap-3 py-4">
									<div class="flex flex-wrap items-center gap-3">
										<Switch
											checked={adapter.enabled}
											onChange={() => props.onToggle(adapter.id)}
											aria-label={`${t("common.enable")} ${adapter.id}`}
										/>
										<strong class="text-primary">{adapter.id}</strong>
										<span class="ts-caption text-secondary">
											{t(
												adapter.type === "direct"
													? "network.adapters.type.direct"
													: "network.adapters.type.proxy"
											)}
										</span>
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
									</div>
									<div class="flex flex-wrap gap-x-6 gap-y-2 ts-caption text-secondary">
										<span>
											{t("network.adapters.col.weight")}: {adapter.baseWeight}
										</span>
										<span>
											{t("network.adapters.col.rateLimit")}:{" "}
											{adapter.rateLimits.length
												? adapter.rateLimits
														.map(
															(limit) =>
																`${limit.maxRequests} / ${limit.durationSeconds}s`
														)
														.join(", ")
												: t("common.unlimited")}
										</span>
										<Show when={runtime()}>
											{(item) => (
												<>
													<span>
														{t("network.adapters.effectiveWeight")}:{" "}
														{item().effectiveWeight.toFixed(2)} ·{" "}
														{t("network.adapters.failures")}:{" "}
														{item().consecutiveFailures}
													</span>
													<Show
														when={
															item().healthState === "open" &&
															item().openUntil
														}
													>
														{(until) => (
															<span>
																{t(
																	"network.adapters.cooldownUntil"
																)}
																:{" "}
																{new Date(until()).toLocaleString()}
															</span>
														)}
													</Show>
												</>
											)}
										</Show>
										<Show when={runtime()?.requests !== undefined}>
											<span>
												{t("network.adapters.requests")}:{" "}
												{runtime()?.requests} ·{" "}
												{t("network.adapters.failedRequests")}:{" "}
												{runtime()?.failures} ·{" "}
												{t("network.adapters.rateLimited")}:{" "}
												{runtime()?.rateLimited}
											</span>
											<span>
												{t("network.adapters.averageLatency")}:{" "}
												{runtime()?.averageDurationMs == null
													? "—"
													: `${runtime()?.averageDurationMs?.toFixed(0)} ms`}
											</span>
										</Show>
										<Show when={result()}>
											{(item) => (
												<span>
													{t("network.adapters.latency")}:{" "}
													{item().ok
														? `${item().latencyMs} ms`
														: item().error || t("common.error")}
												</span>
											)}
										</Show>
									</div>
									<div class="flex flex-wrap gap-2">
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
											disabled={
												props.dirty ||
												staleRuntime() ||
												testing()[adapter.id]
											}
											onClick={() => void test(adapter.id)}
										>
											{testing()[adapter.id]
												? t("network.adapters.testing")
												: t("network.adapters.test")}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => props.onRemove(adapter.id)}
										>
											{t("common.delete")}
										</Button>
									</div>
								</article>
							);
						}}
					</For>
				</div>
			</Show>
		</section>
	);
}
