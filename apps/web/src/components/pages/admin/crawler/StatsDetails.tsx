import { createSignal, For } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import Table from "@components/ui/Table";
import Select from "@components/ui/Select";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric, formatPercent } from "./format";
import { LatencyTable, MetricCard, RatioTable } from "./statsView";
import { DiscoveryStatsTable } from "./DiscoveryStats";

function p95(summary: CrawlerOverviewStats["database"]["durationMs"][string] | undefined): string {
	const value = summary?.quantiles["0.95"];
	return value == null ? "—" : `${Math.round(value)} ms`;
}

export default function StatsDetails(props: {
	stats: CrawlerOverviewStats;
	quantiles: readonly number[];
}) {
	const t = getComponentT("crawler");
	const [outcome, setOutcome] = createSignal("all");
	const latency = () =>
		outcome() === "all"
			? props.stats.latency
			: Object.fromEntries(
					Object.entries(props.stats.latency).filter(([key]) =>
						key.endsWith(`:${outcome()}`)
					)
				);
	const networks = () =>
		Object.entries(props.stats.network).map(([key, value]) => {
			const separator = key.indexOf("|");
			return {
				requestType: key.slice(0, separator),
				endpoint: key.slice(separator + 1, key.indexOf("|", separator + 1)),
				egress: key.slice(key.indexOf("|", separator + 1) + 1),
				...value,
			};
		});
	const database = () => Object.entries(props.stats.database.byOperation);
	const redis = () => Object.entries(props.stats.redis.byCommand);
	return (
		<>
			<section class="flex flex-col gap-3">
				<h3 class="ts-label">{t("metrics.flow")}</h3>
				<Table
					head={
						<tr>
							<th>{t("metrics.operation")}</th>
							<th>{t("metrics.started")}</th>
							<th>{t("metrics.finished")}</th>
						</tr>
					}
				>
					<For
						each={[
							{
								label: "overview.candidatesPerMin",
								started: props.stats.counters.candidatesStarted,
								finished: props.stats.counters.candidatesFinished,
							},
							{
								label: "metrics.operation.httpAttempt",
								started: props.stats.counters.httpAttemptsStarted,
								finished: props.stats.counters.httpAttemptsFinished,
							},
							{
								label: "metrics.operation.logicalRequest",
								started: props.stats.counters.logicalRequestsStarted,
								finished: props.stats.counters.logicalRequestsFinished,
							},
						]}
					>
						{(row) => (
							<tr>
								<td>{t(row.label)}</td>
								<td class="tabular-nums">{row.started}</td>
								<td class="tabular-nums">{row.finished}</td>
							</tr>
						)}
					</For>
				</Table>
			</section>
			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.ratios")}</h3>
				<RatioTable ratios={props.stats.ratios} inputs={props.stats.ratioInputs} />
			</section>

			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.jobs")}</h3>
				<Table
					head={
						<tr>
							<th>{t("queue.name")}</th>
							<th>{t("metrics.completed")}</th>
							<th>{t("metrics.failed")}</th>
							<th>{t("metrics.deferred")}</th>
							<th>{t("metrics.cancelled")}</th>
							<th>{t("metrics.timeout")}</th>
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
								<td>{counts.cancelled}</td>
								<td>{counts.timeout}</td>
							</tr>
						)}
					</For>
				</Table>
			</section>

			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.network")}</h3>
				<Table
					head={
						<tr>
							<th>{t("metrics.requestType")}</th>
							<th>{t("metrics.endpoint")}</th>
							<th>{t("metrics.egress")}</th>
							<th>{t("overview.totalAttempts")}</th>
							<th>{t("metrics.transportSuccess")}</th>
							<th>{t("metrics.transportFailure")}</th>
							<th>{t("metrics.businessErrorCount")}</th>
							<th>{t("metrics.rateLimited")}</th>
							<th>{t("metrics.cancelled")}</th>
							<th>{t("metrics.timeout")}</th>
							<th>{t("metrics.egressResends")}</th>
						</tr>
					}
				>
					<For each={networks()}>
						{(row) => (
							<tr>
								<td>{t(`metrics.requestType.${row.requestType}`)}</td>
								<td>{t(`metrics.networkLabel.${row.endpoint}`)}</td>
								<td>{row.egress}</td>
								<td>{row.attempts}</td>
								<td>{row.transportSuccess}</td>
								<td>{row.transportFailure}</td>
								<td>{row.businessError}</td>
								<td>{row.rateLimited}</td>
								<td>{row.cancelled}</td>
								<td>{row.timeout}</td>
								<td>{row.egressResends}</td>
							</tr>
						)}
					</For>
				</Table>
			</section>

			<DiscoveryStatsTable byChannel={props.stats.discovery.byChannel} />

			<section class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="ts-label text-primary">{t("metrics.latency")}</h3>
					<div class="w-40">
						<Select
							size="sm"
							aria-label={t("metrics.result")}
							value={outcome()}
							options={[
								"all",
								"success",
								"failure",
								"deferred",
								"cancelled",
								"timeout",
							].map((value) => ({
								value,
								label:
									value === "all"
										? t("common.all")
										: t(`metrics.outcome.${value}`),
							}))}
							onValueChange={(value) => {
								if (value) setOutcome(value);
							}}
						/>
					</div>
				</div>
				<LatencyTable latency={latency()} quantiles={props.quantiles} />
			</section>

			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.infrastructure")}</h3>
				<div class="grid gap-3 lg:grid-cols-2">
					<Table
						head={
							<tr>
								<th>{t("metrics.database")}</th>
								<th>{t("metrics.success")}</th>
								<th>{t("metrics.failed")}</th>
								<th>{t("metrics.cancelled")}</th>
								<th>{t("metrics.timeout")}</th>
								<th>P95</th>
							</tr>
						}
					>
						<For each={database()}>
							{([key, counts]) => (
								<tr>
									<td>{key}</td>
									<td>{counts.success}</td>
									<td>{counts.failure}</td>
									<td>{counts.cancelled}</td>
									<td>{counts.timeout}</td>
									<td>{p95(props.stats.database.durationMs[key])}</td>
								</tr>
							)}
						</For>
					</Table>
					<Table
						head={
							<tr>
								<th>{t("metrics.redis")}</th>
								<th>{t("metrics.success")}</th>
								<th>{t("metrics.failed")}</th>
								<th>{t("metrics.cancelled")}</th>
								<th>{t("metrics.timeout")}</th>
								<th>P95</th>
							</tr>
						}
					>
						<For each={redis()}>
							{([key, counts]) => (
								<tr>
									<td>{key}</td>
									<td>{counts.success}</td>
									<td>{counts.failure}</td>
									<td>{counts.cancelled}</td>
									<td>{counts.timeout}</td>
									<td>{p95(props.stats.redis.durationMs[key])}</td>
								</tr>
							)}
						</For>
					</Table>
				</div>
			</section>

			<section class="flex flex-col gap-3">
				<h3 class="ts-label text-primary">{t("metrics.labeling")}</h3>
				<Table
					head={
						<tr>
							<th>{t("metrics.samples")}</th>
							<th>TP</th>
							<th>FP</th>
							<th>TN</th>
							<th>FN</th>
							<th>{t("metrics.accuracy")}</th>
							<th>{t("metrics.precision")}</th>
							<th>{t("metrics.recall")}</th>
						</tr>
					}
				>
					<tr>
						<td>{props.stats.labeling.samples}</td>
						<td>{props.stats.labeling.truePositive}</td>
						<td>{props.stats.labeling.falsePositive}</td>
						<td>{props.stats.labeling.trueNegative}</td>
						<td>{props.stats.labeling.falseNegative}</td>
						<td>
							{props.stats.labeling.accuracy === null
								? "—"
								: formatPercent(props.stats.labeling.accuracy)}
						</td>
						<td>
							{props.stats.labeling.precision === null
								? "—"
								: formatPercent(props.stats.labeling.precision)}
						</td>
						<td>
							{props.stats.labeling.recall === null
								? "—"
								: formatPercent(props.stats.labeling.recall)}
						</td>
					</tr>
				</Table>
			</section>

			{props.stats.legacy ? (
				<section class="flex flex-col gap-3">
					<h3 class="ts-label text-primary">{t("metrics.legacy")}</h3>
					<div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
						<MetricCard
							label={t("metrics.legacySnapshots")}
							value={formatMetric(props.stats.legacy.counters.snapshotsSaved)}
						/>
						<MetricCard
							label={t("metrics.legacyRequests")}
							value={formatMetric(props.stats.legacy.counters.networkRequests)}
						/>
						<MetricCard
							label={t("metrics.legacyCandidates")}
							value={formatMetric(props.stats.legacy.counters.candidatesScanned)}
						/>
						<MetricCard
							label={t("metrics.legacyJobs")}
							value={formatMetric(props.stats.legacy.counters.jobsCompleted)}
						/>
					</div>
				</section>
			) : null}
		</>
	);
}
