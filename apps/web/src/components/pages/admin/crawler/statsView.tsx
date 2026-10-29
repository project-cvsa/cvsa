import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { Show, type JSX } from "solid-js";
import clsx from "clsx";
import type { CrawlerOverviewStats, CrawlerQueueSnapshot } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatPercent, formatWaitSeconds } from "./format";

/** One headline metric. */
export function MetricCard(props: {
	label: string;
	value: string | JSX.Element;
	hint?: string | JSX.Element;
	variant?: "default" | "success" | "warning" | "danger";
	icon?: () => JSX.Element;
}) {
	return (
		<div
			class={clsx(
				"p-4 bg-surface flex flex-col justify-between gap-1.5",
				props.variant === "warning" && "border-l-2 border-highlight",
				props.variant === "danger" && "border-l-2 border-error"
			)}
		>
			<div class="flex items-center justify-between gap-2">
				<span class="ts-caption text-xs uppercase tracking-wide text-tertiary select-none">
					{props.label}
				</span>
				<Show when={props.icon}>
					{(Icon) => <div class="text-tertiary shrink-0">{Icon()()}</div>}
				</Show>
			</div>
			<div class="ts-heading-3 font-semibold text-primary tracking-tight mt-0.5">
				{props.value}
			</div>
			<Show when={props.hint}>
				<div class="ts-caption text-tertiary text-xs mt-0.5">{props.hint}</div>
			</Show>
		</div>
	);
}

/** Per-queue backlog counters. */
export function QueueStatusTable(props: {
	queues: Record<string, CrawlerQueueSnapshot>;
	emptyLabel?: string;
}) {
	const t = getComponentT("crawler");
	const rows = () => Object.entries(props.queues).map(([name, snapshot]) => ({ name, snapshot }));

	type QueueRow = { name: string; snapshot: CrawlerQueueSnapshot };
	const count = (value: number, variant: "info" | "neutral" | "warning" | "danger") => (
		<Show when={value > 0} fallback={<span class="text-tertiary">0</span>}>
			<Badge variant={variant} size="sm">
				{value}
			</Badge>
		</Show>
	);
	const columns: TableColumn<QueueRow>[] = [
		{
			id: "name",
			header: t("queue.name"),
			class: "font-medium text-primary",
			cell: (row) => row.name,
		},
		{
			id: "active",
			header: t("queue.active"),
			cell: (row) => count(row.snapshot.active, "info"),
		},
		{
			id: "waiting",
			header: t("queue.waiting"),
			cell: (row) => count(row.snapshot.waiting, "neutral"),
		},
		{
			id: "delayed",
			header: t("queue.delayed"),
			cell: (row) => count(row.snapshot.delayed, "warning"),
		},
		{
			id: "failed",
			header: t("queue.failed"),
			cell: (row) => count(row.snapshot.failed, "danger"),
		},
		{
			id: "oldest",
			header: t("queue.oldest"),
			class: "text-secondary",
			cell: (row) => formatWaitSeconds(row.snapshot.oldestWaitSec),
		},
	];
	return (
		<DataTable columns={columns} items={rows()} empty={props.emptyLabel ?? t("queue.empty")} />
	);
}

/** Isomorphic failure status table matching QueueStatusTable styling */

export function FailureStatusTable(props: {
	breakdown: CrawlerOverviewStats["breakdown"];
	totalFailures: number;
	windowLabel: string;
}) {
	const t = getComponentT("crawler");
	const categories: Array<{ key: keyof CrawlerOverviewStats["breakdown"]; label: string }> = [
		{ key: "timeout", label: "timeout" },
		{ key: "networkFailure", label: "networkFailure" },
		{ key: "httpFailure", label: "httpFailure" },
		{ key: "networkOther", label: "networkOther" },
		{ key: "adapterUnavailable", label: "adapterUnavailable" },
		{ key: "rateLimited412Or429", label: "rateLimited" },
		{ key: "bilibiliBusinessError", label: "bilibiliBusiness" },
		{ key: "inferenceError", label: "inference" },
		{ key: "dbError", label: "db" },
		{ key: "other", label: "other" },
	];
	const rows = () =>
		categories
			.map((category) => ({ ...category, count: props.breakdown[category.key] ?? 0 }))
			.filter((row) => row.count > 0)
			.sort((a, b) => b.count - a.count);
	type FailureRow = ReturnType<typeof rows>[number];
	const columns: TableColumn<FailureRow>[] = [
		{
			id: "category",
			header: t("overview.failures.category"),
			class: "w-1/2 text-primary",
			cell: (row) => t(`overview.err.${row.label}`),
		},
		{
			id: "count",
			header: t("overview.failures.count"),
			class: "text-right text-error",
			cell: (row) => row.count,
		},
		{
			id: "ratio",
			header: t("overview.failures.ratio"),
			class: "text-right text-secondary",
			cell: (row) =>
				formatPercent(props.totalFailures > 0 ? row.count / props.totalFailures : 0),
		},
	];
	return <DataTable columns={columns} items={rows()} empty={t("audit.noErrors")} />;
}
