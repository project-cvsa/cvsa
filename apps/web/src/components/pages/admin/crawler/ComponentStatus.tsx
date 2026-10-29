import { Show, type JSX } from "solid-js";
import type { ClassifierHealthDto, CrawlerOverviewStats, CrawlerStatusDto } from "@cvsa/contracts";
import Badge, { type BadgeVariant } from "@components/ui/Badge";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric } from "./format";

type ComponentStatusProps = {
	stats: CrawlerOverviewStats;
	status: CrawlerStatusDto | null;
	classifier: ClassifierHealthDto | null;
};

function ClassifierStatus(props: { health: ClassifierHealthDto | null }) {
	const t = getComponentT("crawler");
	const presentation = (): { variant: BadgeVariant; label: string } => {
		if (!props.health) return { variant: "neutral", label: t("common.loading") };
		if (!props.health.reachable)
			return { variant: "danger", label: t("overview.classifier.status.unavailable") };
		if (!props.health.modelsLoaded)
			return { variant: "warning", label: t("overview.classifier.status.notLoaded") };
		return { variant: "success", label: t("overview.classifier.status.ready") };
	};
	return (
		<div class="flex items-start gap-1">
			<Badge size="sm" variant={presentation().variant}>
				{presentation().label}
			</Badge>
			<Show when={props.health?.modelVersion}>
				{(version) => <span class="ts-caption text-secondary">{version()}</span>}
			</Show>
			<Show when={props.health?.error}>
				{(message) => <p class="ts-caption text-error break-words">{message()}</p>}
			</Show>
		</div>
	);
}

export default function ComponentStatus(props: ComponentStatusProps) {
	const t = getComponentT("crawler");
	const adapters = () => props.status?.adapters ?? [];
	const healthy = () =>
		adapters().filter(
			(adapter) => adapter.enabled && adapter.healthState.toLowerCase() === "healthy"
		).length;
	const jobs = (state: "active" | "waiting") =>
		Object.values(props.stats.queues).reduce((sum, queue) => sum + queue[state], 0);
	type ComponentRow = { id: string; label: string; status: JSX.Element; latency: number | null };
	const rows = (): ComponentRow[] => [
		{
			id: "classifier",
			label: t("overview.classifier.title"),
			status: <ClassifierStatus health={props.classifier} />,
			latency: props.classifier?.modelsLoaded ? props.stats.latencyMs.inferenceP95 : null,
		},
		{
			id: "adapters",
			label: t("overview.adapters"),
			status: (
				<Show when={props.status} fallback={t("common.unknown")}>
					<Badge size="sm" variant={healthy() > 0 ? "success" : "danger"}>
						{t("overview.healthyCount")
							.replace("{healthy}", String(healthy()))
							.replace("{total}", String(adapters().length))}
					</Badge>
				</Show>
			),
			latency: props.stats.latencyMs.apiP95,
		},
		{
			id: "tasks",
			label: t("audit.taskProcessor"),
			status: (
				<span>
					{t("audit.active")} {jobs("active")} · {t("audit.waiting")} {jobs("waiting")}
				</span>
			),
			latency: props.stats.latencyMs.taskP95,
		},
	];
	const columns: TableColumn<ComponentRow>[] = [
		{ id: "component", header: t("audit.component"), class: "w-1/3", cell: (row) => row.label },
		{ id: "status", header: t("audit.health"), cell: (row) => row.status },
		{
			id: "latency",
			header: t("overview.latency"),
			class: "text-right whitespace-nowrap",
			cell: (row) => (row.latency === null ? "—" : `${formatMetric(row.latency)} ms`),
		},
	];
	return (
		<section class="flex flex-col gap-3">
			<h3 class="ts-label">{t("audit.components")}</h3>
			<DataTable columns={columns} items={rows()} />
		</section>
	);
}
