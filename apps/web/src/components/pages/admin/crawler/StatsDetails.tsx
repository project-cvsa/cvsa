import { For } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import Table from "@components/ui/Table";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric, formatPercent } from "./format";
import { MetricCard } from "./statsView";

export default function StatsDetails(props: { stats: CrawlerOverviewStats }) {
	const t = getComponentT("crawler");
	const flow = () => [
		{ key: "aidsRequested", value: props.stats.counters.aidsRequested },
		{ key: "aidsReturned", value: props.stats.counters.aidsReturned },
		{ key: "aidsMissing", value: props.stats.counters.aidsMissing },
		{ key: "candidatesSeen", value: props.stats.counters.candidatesSeen },
		{ key: "candidatesSkipped", value: props.stats.counters.candidatesSkipped },
		{ key: "candidatesScanned", value: props.stats.counters.candidatesScanned },
		{ key: "candidatesRejected", value: props.stats.counters.candidatesRejected },
		{ key: "candidatesFailed", value: props.stats.counters.candidatesFailed },
	];
	const networks = () =>
		Object.entries(props.stats.network).map(([key, value]) => {
			const separator = key.indexOf(":");
			return {
				dimension: key.slice(0, separator),
				label: key.slice(separator + 1),
				...value,
			};
		});
	return (
		<>
			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.flow")}</h3>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
					<For each={flow()}>
						{(metric) => (
							<MetricCard
								label={t(`metrics.${metric.key}`)}
								value={formatMetric(metric.value)}
							/>
						)}
					</For>
				</div>
				<p class="ts-caption text-secondary">{t("metrics.flowHelp")}</p>
			</section>
			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.jobs")}</h3>
				<Table
					head={
						<tr>
							<th>{t("queue.name")}</th>
							<th>{t("metrics.completed")}</th>
							<th>{t("queue.failed")}</th>
							<th>{t("metrics.deferred")}</th>
						</tr>
					}
				>
					<For each={Object.entries(props.stats.jobs)}>
						{([name, counts]) => (
							<tr>
								<td>{t(`metrics.queue.${name}`)}</td>
								<td>{counts.completed}</td>
								<td>{counts.failed}</td>
								<td>{counts.deferred}</td>
							</tr>
						)}
					</For>
				</Table>
				<p class="ts-caption text-secondary">{t("metrics.jobsHelp")}</p>
			</section>
			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.network")}</h3>
				<Table
					head={
						<tr>
							<th>{t("metrics.dimension")}</th>
							<th>{t("metrics.name")}</th>
							<th>{t("overview.totalAttempts")}</th>
							<th>{t("overview.successRate")}</th>
							<th>{t("metrics.businessErrorCount")}</th>
							<th>{t("metrics.rateLimited")}</th>
							<th>{t("metrics.transportFailures")}</th>
						</tr>
					}
				>
					<For each={networks()}>
						{(row) => (
							<tr>
								<td>{t(`metrics.dimension.${row.dimension}`)}</td>
								<td>
									{row.dimension === "egress"
										? row.label
										: t(`metrics.networkLabel.${row.label}`)}
								</td>
								<td>{row.requests}</td>
								<td>
									{formatPercent(
										row.requests > 0 ? row.success / row.requests : 0
									)}
								</td>
								<td>{row.businessErrors}</td>
								<td>{row.rateLimited}</td>
								<td>{row.transportFailures}</td>
							</tr>
						)}
					</For>
				</Table>
				<p class="ts-caption text-secondary">{t("metrics.networkHelp")}</p>
			</section>
		</>
	);
}
