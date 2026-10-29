import { createEffect, createSignal, For, Show } from "solid-js";

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

type AdapterCardProps = {
	adapter: NetworkAdapterConfig;
	runtime: CrawlerStatusDto["adapters"][number] | undefined;
	result: TestNetworkAdapterResponse | undefined;
	testing: boolean;
	testDisabled: boolean;
	onToggle: () => void;
	onEdit: () => void;
	onRemove: () => void;
	onTest: () => void;
};

function AdapterCard(props: AdapterCardProps) {
	const t = getComponentT("crawler");
	const rateLimit = () =>
		props.adapter.rateLimits.length
			? props.adapter.rateLimits
					.map((limit) => `${limit.maxRequests}/${limit.durationSeconds}s`)
					.join(", ")
			: t("common.unlimited");
	const metrics = () => [
		{ label: t("network.adapters.col.weight"), value: props.adapter.baseWeight },
		{
			label: t("network.adapters.effectiveWeight"),
			value: props.runtime?.effectiveWeight.toFixed(2) ?? "—",
		},
		{ label: t("network.adapters.col.rateLimit"), value: rateLimit() },
		{
			label: t("network.adapters.requests"),
			value: (
				<span>
					{props.runtime?.requests ?? 0}
					<Show when={props.runtime?.failures}>
						<span class="text-error ml-1">({props.runtime?.failures} err)</span>
					</Show>
				</span>
			),
		},
		{
			label: t("network.adapters.averageLatency"),
			value:
				props.runtime?.averageDurationMs == null
					? "—"
					: `${props.runtime.averageDurationMs.toFixed(0)} ms`,
		},
	];
	return (
		<Card class="flex flex-col">
			<CardHeader
				title={
					<div class="flex items-center gap-2.5 min-w-0">
						<Switch
							size="sm"
							checked={props.adapter.enabled}
							onChange={props.onToggle}
							aria-label={`${t("common.enable")} ${props.adapter.id}`}
						/>
						<span class="font-semibold text-primary truncate text-sm">
							{props.adapter.id}
						</span>
						<span class="text-xs text-tertiary">
							{t(`network.adapters.type.${props.adapter.type}`)}
						</span>
					</div>
				}
				actions={
					<Show when={props.runtime}>
						{(runtime) => (
							<Badge size="sm" variant={healthPresentation(runtime()).variant}>
								{t(healthPresentation(runtime()).label)}
							</Badge>
						)}
					</Show>
				}
			/>
			<CardContent class="p-4 flex flex-col gap-4 flex-1 justify-between">
				<dl class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
					<For each={metrics()}>
						{(metric) => (
							<div>
								<dt class="text-tertiary mb-0.5">{metric.label}</dt>
								<dd class="font-medium text-primary break-words">{metric.value}</dd>
							</div>
						)}
					</For>
					<Show when={props.result}>
						{(result) => (
							<div>
								<dt class="text-tertiary mb-0.5">
									{t("network.adapters.latency")}
								</dt>
								<dd class={result().ok ? "text-success" : "text-error"}>
									{result().ok
										? `${result().latencyMs} ms`
										: result().error || t("common.error")}
								</dd>
							</div>
						)}
					</Show>
				</dl>
				<div class="flex items-center justify-end gap-2">
					<Button
						size="sm"
						variant="outlined"
						disabled={props.testDisabled || props.testing}
						onClick={props.onTest}
					>
						{props.testing ? t("network.adapters.testing") : t("common.test")}
					</Button>
					<Button size="sm" variant="outlined" onClick={props.onEdit}>
						{t("common.edit")}
					</Button>
					<Button
						size="sm"
						variant="outlined"
						class="text-error"
						onClick={props.onRemove}
					>
						{t("common.delete")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
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
						{(adapter) => (
							<AdapterCard
								adapter={adapter}
								runtime={props.status?.adapters.find(
									(item) => item.id === adapter.id
								)}
								result={results()[adapter.id]}
								testing={testing()[adapter.id] ?? false}
								testDisabled={props.dirty || staleRuntime()}
								onToggle={() => props.onToggle(adapter.id)}
								onEdit={() => props.onEdit(adapter)}
								onRemove={() => props.onRemove(adapter.id)}
								onTest={() => void test(adapter.id)}
							/>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
