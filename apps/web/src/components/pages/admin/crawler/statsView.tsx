import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { Show, type JSX } from "solid-js";
import { cn } from "@lib/cn";
import type {
	CrawlerStatsQueueState,
	CrawlerStatsLatency,
	CrawlerStatsRatio,
	CrawlerStatsRatioInputs,
} from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric, formatPercent, formatWaitSeconds } from "./format";

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
			class={cn(
				"p-4 bg-surface flex flex-col justify-between gap-1.5",
				props.variant === "warning" && "border-l-2 border-highlight",
				props.variant === "danger" && "border-l-2 border-error"
			)}
		>
			<div class="flex items-center justify-between gap-2">
				<span class="ts-caption text-secondary">{props.label}</span>
				<Show when={props.icon}>
					{(Icon) => <div class="text-tertiary shrink-0">{Icon()()}</div>}
				</Show>
			</div>
			<div class="ts-heading-3 text-primary mt-0.5">{props.value}</div>
			<Show when={props.hint}>
				<div class="ts-caption text-tertiary mt-0.5">{props.hint}</div>
			</Show>
		</div>
	);
}

/** Per-queue backlog counters. `waiting` already includes `prioritized`. */
export function QueueStatusTable(props: {
	queues: Record<string, CrawlerStatsQueueState>;
	emptyLabel?: string;
}) {
	const t = getComponentT("crawler");
	const rows = () => Object.entries(props.queues).map(([name, snapshot]) => ({ name, snapshot }));

	type QueueRow = { name: string; snapshot: CrawlerStatsQueueState };
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
			cell: (row) => t(`metrics.queue.${row.name}`),
		},
		{
			id: "active",
			header: t("queue.active"),
			cell: (row) => count(row.snapshot.active, "info"),
		},
		{
			id: "waiting",
			header: t("queue.waiting"),
			cell: (row) => (
				<span>
					{count(row.snapshot.waiting, "neutral")}
					<Show when={row.snapshot.prioritized > 0}>
						<span class="ts-caption text-tertiary">
							{" "}
							({row.snapshot.prioritized} {t("queue.prioritized")})
						</span>
					</Show>
				</span>
			),
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
		{
			id: "activeAge",
			header: t("queue.activeAge"),
			class: "text-secondary",
			cell: (row) => formatWaitSeconds(row.snapshot.activeAgeSec),
		},
	];
	return (
		<DataTable columns={columns} items={rows()} empty={props.emptyLabel ?? t("queue.empty")} />
	);
}

function ratio(value: number | null): string {
	return value === null ? "—" : formatPercent(value);
}

export function RatioTable(props: { ratios: CrawlerStatsRatio; inputs: CrawlerStatsRatioInputs }) {
	const t = getComponentT("crawler");
	type Row = { id: string; label: string; value: number | null; detail: string };
	const rows = (): Row[] => [
		{
			id: "httpTransportSuccess",
			label: t("metrics.ratio.httpTransportSuccess"),
			value: props.ratios.httpTransportSuccess,
			detail: `${props.inputs.httpTransportSuccess} / ${props.inputs.httpAttemptsFinished - props.inputs.httpAttemptsCancelled}`,
		},
		{
			id: "logicalRequestSuccess",
			label: t("metrics.ratio.logicalRequestSuccess"),
			value: props.ratios.logicalRequestSuccess,
			detail: `${props.inputs.logicalRequestSuccess} / ${props.inputs.logicalRequests}`,
		},
		{
			id: "egressResendShare",
			label: t("metrics.ratio.egressResendShare"),
			value: props.ratios.egressResendShare,
			detail: `${props.inputs.egressResends} / ${props.inputs.httpAttemptsFinished}`,
		},
		{
			id: "sessionResendShare",
			label: t("metrics.ratio.sessionResendShare"),
			value: props.ratios.sessionResendShare,
			detail: `${props.inputs.sessionResends} / ${props.inputs.httpAttemptsFinished}`,
		},
		{
			id: "retryRecoverySuccess",
			label: t("metrics.ratio.retryRecoverySuccess"),
			value: props.ratios.retryRecoverySuccess,
			detail: `${props.inputs.retriedLogicalRequestSuccess} / ${props.inputs.retriedLogicalRequests}`,
		},
		{
			id: "requestsPerRecord",
			label: t("metrics.ratio.requestsPerRecord"),
			value: props.ratios.requestsPerRecord,
			detail: `${props.inputs.httpAttemptsFinished} / ${props.inputs.videosRecorded}`,
		},
	];
	const columns: TableColumn<Row>[] = [
		{ id: "label", header: t("metrics.name"), class: "text-primary", cell: (row) => row.label },
		{
			id: "value",
			header: t("metrics.value"),
			class: "text-right",
			cell: (row) =>
				row.id === "requestsPerRecord"
					? row.value === null
						? "—"
						: formatMetric(row.value)
					: ratio(row.value),
		},
		{
			id: "detail",
			header: t("metrics.ratioInputs"),
			class: "text-right text-secondary",
			cell: (row) => row.detail,
		},
	];
	return <DataTable columns={columns} items={rows()} />;
}

export function LatencyTable(props: {
	latency: CrawlerStatsLatency;
	quantiles: readonly number[];
}) {
	const t = getComponentT("crawler");
	type Row = {
		key: string;
		operation: string;
		outcome: string;
		summary: CrawlerStatsLatency[string];
	};
	const rows = () =>
		Object.entries(props.latency)
			.map(([key, summary]) => {
				const separator = key.indexOf(":");
				return {
					key,
					operation: key.slice(0, separator),
					outcome: key.slice(separator + 1),
					summary,
				};
			})
			.filter((row) => row.summary.count > 0);
	const quantileColumns = (): TableColumn<Row>[] =>
		props.quantiles.map((quantile) => ({
			id: `p${quantile}`,
			header: `P${Number((quantile * 100).toFixed(1))}`,
			class: "text-right",
			cell: (row) => formatQuantile(row.summary.quantiles[String(quantile)]),
		}));
	const columns = (): TableColumn<Row>[] => [
		{
			id: "operation",
			header: t("metrics.operation"),
			class: "text-primary",
			cell: (row) => t(`metrics.operation.${row.operation}`),
		},
		{
			id: "outcome",
			header: t("metrics.result"),
			class: "text-secondary",
			cell: (row) => t(`metrics.outcome.${row.outcome}`),
		},
		{
			id: "count",
			header: t("metrics.count"),
			class: "text-right",
			cell: (row) => row.summary.count,
		},
		{
			id: "mean",
			header: t("metrics.mean"),
			class: "text-right",
			cell: (row) => (row.summary.mean === null ? "—" : `${Math.round(row.summary.mean)} ms`),
		},
		...quantileColumns(),
		{
			id: "max",
			header: t("metrics.max"),
			class: "text-right",
			cell: (row) => (row.summary.max === null ? "—" : `${Math.round(row.summary.max)} ms`),
		},
	];
	return <DataTable columns={columns()} items={rows()} empty={t("metrics.noSamples")} />;
}

function formatQuantile(value: number | null | undefined): string {
	return value === null || value === undefined ? "—" : `${Math.round(value)} ms`;
}
