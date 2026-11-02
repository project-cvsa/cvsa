import { Show } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Table from "@components/ui/Table";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatDateTime, formatMetric, formatWaitSeconds } from "./format";

function formatUnconfirmed(value: number | null): string {
	return value === null ? "—" : formatDateTime(new Date(value).toISOString());
}

export default function OperationalStatus(props: { stats: CrawlerOverviewStats }) {
	const t = getComponentT("crawler");
	const coverage = () => props.stats.coverage;
	const persistence = () => props.stats.persistence;
	const exportState = () => props.stats.current.export;

	type InstanceRow = CrawlerOverviewStats["instances"][number];
	const instanceColumns: TableColumn<InstanceRow>[] = [
		{ id: "id", header: t("metrics.instance"), cell: (row) => row.instanceId.slice(0, 8) },
		{
			id: "started",
			header: t("metrics.startedAt"),
			cell: (row) => formatDateTime(row.startedAt),
		},
		{
			id: "covered",
			header: t("metrics.coveredTo"),
			cell: (row) => formatDateTime(row.coveredTo),
		},
		{
			id: "heartbeat",
			header: t("metrics.heartbeat"),
			cell: (row) => formatDateTime(row.heartbeatAt),
		},
		{
			id: "state",
			header: t("metrics.state"),
			cell: (row) => (
				<Badge size="sm" variant={row.active ? "success" : "neutral"}>
					{row.active ? t("metrics.active") : t("metrics.stopped")}
				</Badge>
			),
		},
	];

	type FreshnessRow = CrawlerOverviewStats["current"]["tracking"]["freshness"] & {
		group: string;
		kind: string;
	};
	const freshnessColumns: TableColumn<FreshnessRow>[] = [
		{
			id: "group",
			header: t("metrics.group"),
			cell: (row) => `${row.kind}: ${row.group}`,
		},
		{
			id: "samples",
			header: t("metrics.samples"),
			class: "text-right",
			cell: (row) => row.count,
		},
		{
			id: "mean",
			header: t("metrics.mean"),
			class: "text-right",
			cell: (row) => (row.meanSec === null ? "—" : formatWaitSeconds(row.meanSec)),
		},
		{
			id: "p95",
			header: "P95",
			class: "text-right",
			cell: (row) =>
				row.quantilesSec["0.95"] == null
					? "—"
					: formatWaitSeconds(row.quantilesSec["0.95"] ?? 0),
		},
		{
			id: "max",
			header: t("metrics.max"),
			class: "text-right",
			cell: (row) => (row.maxSec === null ? "—" : formatWaitSeconds(row.maxSec)),
		},
	];
	const freshnessRows = (): FreshnessRow[] => [
		...Object.entries(props.stats.current.tracking.freshnessByState).map(
			([group, freshness]) => ({
				...freshness,
				group: t(`videos.state.${group}`),
				kind: t("metrics.state"),
			})
		),
		...Object.entries(props.stats.current.tracking.freshnessByPriority).map(
			([group, freshness]) => ({
				...freshness,
				group: `${t("metrics.priority")} ${group}`,
				kind: t("metrics.kind"),
			})
		),
	];

	type StrategyRow = CrawlerOverviewStats["current"]["strategies"][number];
	const strategyColumns: TableColumn<StrategyRow>[] = [
		{
			id: "strategy",
			header: t("metrics.strategy"),
			cell: (row) => t(`metrics.strategy.${row.key}`),
		},
		{
			id: "support",
			header: t("metrics.support"),
			cell: (row) => (
				<Badge
					size="sm"
					variant={
						row.support === "active"
							? "success"
							: row.support === "configured_not_wired"
								? "warning"
								: "neutral"
					}
				>
					{t(`metrics.support.${row.support}`)}
				</Badge>
			),
		},
		{
			id: "configured",
			header: t("metrics.configured"),
			cell: (row) => (row.configured ? t("common.yes") : t("common.no")),
		},
		{
			id: "value",
			header: t("metrics.effectiveValue"),
			cell: (row) =>
				row.healthFactor !== null
					? formatMetric(row.healthFactor)
					: row.adaptiveFactor !== null
						? formatMetric(row.adaptiveFactor)
						: row.reservedShare !== null
							? formatMetric(row.reservedShare)
							: "—",
		},
	];

	return (
		<details class="bg-surface p-4">
			<summary class="ts-label text-primary cursor-pointer">{t("metrics.statsFlow")}</summary>
			<div class="mt-4 flex flex-col gap-6">
				<section class="flex flex-col gap-3">
					<h3 class="ts-label text-primary">{t("metrics.coverageSection")}</h3>
					<Table
						head={
							<tr>
								<th>{t("metrics.coverageStatus")}</th>
								<th>{t("metrics.coveredMinutes")}</th>
								<th>{t("metrics.missingMinutes")}</th>
								<th>{t("metrics.enabledAt")}</th>
								<th>{t("metrics.unconfirmedFrom")}</th>
								<th>{t("metrics.persistence")}</th>
								<th>{t("metrics.pendingMinutes")}</th>
								<th>{t("metrics.oldestPending")}</th>
								<th>{t("metrics.pendingHours")}</th>
								<th>{t("metrics.rollupFailures")}</th>
							</tr>
						}
					>
						<tr>
							<td>
								<Badge
									size="sm"
									variant={
										coverage().status === "complete"
											? "success"
											: coverage().status === "partial"
												? "warning"
												: "danger"
									}
								>
									{t(`metrics.coverage.${coverage().status}`)}
								</Badge>
							</td>
							<td>{coverage().coveredMinutes}</td>
							<td>{coverage().missingMinutes}</td>
							<td>{formatDateTime(coverage().enabledAt)}</td>
							<td>{formatUnconfirmed(coverage().unconfirmedFrom)}</td>
							<td>{t(`metrics.persistenceState.${persistence().state}`)}</td>
							<td>{persistence().pendingMinutes}</td>
							<td>
								{persistence().oldestPendingAgeSec === null
									? "—"
									: formatWaitSeconds(persistence().oldestPendingAgeSec ?? 0)}
							</td>
							<td>{persistence().pendingHours}</td>
							<td>{persistence().rollupFailures}</td>
						</tr>
					</Table>
					<DataTable
						columns={instanceColumns}
						items={props.stats.instances}
						empty={t("metrics.noInstances")}
					/>
				</section>

				<section class="flex flex-col gap-3">
					<h3 class="ts-label text-primary">{t("metrics.backlog")}</h3>
					<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
						<div class="p-3 bg-surface">
							<div class="ts-overline text-tertiary">{t("metrics.dueNow")}</div>
							<div class="ts-heading-3">{props.stats.current.tracking.dueNow}</div>
						</div>
						<div class="p-3 bg-surface">
							<div class="ts-overline text-tertiary">{t("metrics.metadataDue")}</div>
							<div class="ts-heading-3">
								{props.stats.current.tracking.metadataDue}
							</div>
						</div>
						<div class="p-3 bg-surface">
							<div class="ts-overline text-tertiary">
								{t("metrics.neverCaptured")}
							</div>
							<div class="ts-heading-3">
								{props.stats.current.tracking.neverCaptured}
							</div>
						</div>
						<div class="p-3 bg-surface">
							<div class="ts-overline text-tertiary">
								{t("metrics.videoCoverage")}
							</div>
							<div class="ts-heading-3">
								{props.stats.videoCoverage === null
									? "—"
									: props.stats.videoCoverage}
							</div>
						</div>
					</div>
					<DataTable
						columns={freshnessColumns}
						items={freshnessRows()}
						empty={t("metrics.noSamples")}
					/>
					<p class="ts-caption text-secondary">
						{t("metrics.freshness")
							.replace(
								"{mean}",
								props.stats.current.tracking.freshness.meanSec === null
									? "—"
									: formatWaitSeconds(
											props.stats.current.tracking.freshness.meanSec
										)
							)
							.replace(
								"{p95}",
								props.stats.current.tracking.freshness.quantilesSec["0.95"] == null
									? "—"
									: formatWaitSeconds(
											props.stats.current.tracking.freshness.quantilesSec[
												"0.95"
											] ?? 0
										)
							)
							.replace(
								"{max}",
								props.stats.current.tracking.freshness.maxSec === null
									? "—"
									: formatWaitSeconds(
											props.stats.current.tracking.freshness.maxSec
										)
							)}
					</p>
				</section>

				<section class="flex flex-col gap-3">
					<h3 class="ts-label text-primary">{t("metrics.runtime")}</h3>
					<Table
						head={
							<tr>
								<th>{t("metrics.item")}</th>
								<th>{t("metrics.value")}</th>
							</tr>
						}
					>
						<tr>
							<td>{t("metrics.modelActive")}</td>
							<td>
								{props.stats.current.model.activeRequests} /{" "}
								{props.stats.current.model.waitingRequests}
							</td>
						</tr>
						<tr>
							<td>{t("metrics.modelLifecycle")}</td>
							<td>
								{props.stats.current.model.starts} /{" "}
								{props.stats.current.model.exits} /{" "}
								{props.stats.current.model.loadFailures}
							</td>
						</tr>
						<Show when={props.stats.current.resources}>
							{(resources) => (
								<tr>
									<td>{t("metrics.resources")}</td>
									<td>
										{resources()
											.processes.map(
												(process) =>
													`${process.role}: ${formatMetric(process.cpuPercent)}% / ${formatMetric(process.rssBytes / 1_048_576)} MiB`
											)
											.join(", ") || "—"}
										{resources().eventLoopDelayMs === null
											? ""
											: `, ${formatMetric(resources().eventLoopDelayMs ?? 0)} ms`}
									</td>
								</tr>
							)}
						</Show>
						<tr>
							<td>{t("metrics.otlp")}</td>
							<td>
								<Badge
									size="sm"
									variant={exportState().enabled ? "success" : "neutral"}
								>
									{exportState().enabled
										? t(`metrics.exportResult.${exportState().lastResult}`)
										: t("metrics.exportDisabled")}
								</Badge>{" "}
								{exportState().lastSuccessAt
									? formatDateTime(exportState().lastSuccessAt)
									: "—"}
							</td>
						</tr>
					</Table>
				</section>

				<section class="flex flex-col gap-3">
					<h3 class="ts-label text-primary">{t("metrics.strategies")}</h3>
					<DataTable columns={strategyColumns} items={props.stats.current.strategies} />
					<p class="ts-caption text-secondary">{t("metrics.strategiesHelp")}</p>
				</section>
			</div>
		</details>
	);
}
