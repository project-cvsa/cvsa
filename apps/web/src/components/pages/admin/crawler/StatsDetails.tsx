import { createSignal, For } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import Table from "@components/ui/Table";
import Select from "@components/ui/Select";
import { Card, CardContent, CardHeader } from "@components/ui/Card";
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
	const t = getComponentT("crawler:metrics");
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
		<div class="flex flex-col gap-6">
			{/* 1. Core Pipeline Latency Breakdown */}
			<Card>
				<CardHeader
					title={t("metrics.latency")}
					actions={
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
					}
				/>
				<CardContent class="p-0">
					<LatencyTable latency={latency()} quantiles={props.quantiles} />
				</CardContent>
			</Card>

			{/* 2. Pipeline Flow & Conversion Ratios */}
			<div class="grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader title={t("metrics.flow")} />
					<CardContent class="p-0">
						<Table
							head={
								<tr>
									<th>{t("metrics.operation")}</th>
									<th class="text-right">{t("metrics.started")}</th>
									<th class="text-right">{t("metrics.finished")}</th>
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
										<td class="text-right tabular-nums">{row.started}</td>
										<td class="text-right tabular-nums">{row.finished}</td>
									</tr>
								)}
							</For>
						</Table>
					</CardContent>
				</Card>

				<Card>
					<CardHeader title={t("metrics.ratios")} />
					<CardContent class="p-0">
						<RatioTable ratios={props.stats.ratios} inputs={props.stats.ratioInputs} />
					</CardContent>
				</Card>
			</div>

			{/* 3. Network Traffic & Egress Scheduling */}
			<Card>
				<CardHeader title={t("metrics.network")} />
				<CardContent class="p-0">
					<Table
						head={
							<tr>
								<th>{t("metrics.requestType")}</th>
								<th>{t("metrics.endpoint")}</th>
								<th>{t("metrics.egress")}</th>
								<th class="text-right">{t("overview.totalAttempts")}</th>
								<th class="text-right">{t("metrics.transportSuccess")}</th>
								<th class="text-right">{t("metrics.transportFailure")}</th>
								<th class="text-right">{t("metrics.businessErrorCount")}</th>
								<th class="text-right">{t("metrics.rateLimited")}</th>
								<th class="text-right">{t("metrics.cancelled")}</th>
								<th class="text-right">{t("metrics.timeout")}</th>
								<th class="text-right">{t("metrics.egressResends")}</th>
							</tr>
						}
					>
						<For each={networks()}>
							{(row) => (
								<tr>
									<td>{t(`metrics.requestType.${row.requestType}`)}</td>
									<td>{t(`metrics.networkLabel.${row.endpoint}`)}</td>
									<td>{row.egress}</td>
									<td class="text-right tabular-nums">{row.attempts}</td>
									<td class="text-right tabular-nums">{row.transportSuccess}</td>
									<td class="text-right tabular-nums">{row.transportFailure}</td>
									<td class="text-right tabular-nums">{row.businessError}</td>
									<td class="text-right tabular-nums">{row.rateLimited}</td>
									<td class="text-right tabular-nums">{row.cancelled}</td>
									<td class="text-right tabular-nums">{row.timeout}</td>
									<td class="text-right tabular-nums">{row.egressResends}</td>
								</tr>
							)}
						</For>
					</Table>
				</CardContent>
			</Card>

			{/* 4. Queue Jobs Processing */}
			<Card>
				<CardHeader title={t("metrics.jobs")} />
				<CardContent class="p-0">
					<Table
						head={
							<tr>
								<th>{t("queue.name")}</th>
								<th class="text-right">{t("metrics.completed")}</th>
								<th class="text-right">{t("metrics.failed")}</th>
								<th class="text-right">{t("metrics.deferred")}</th>
								<th class="text-right">{t("metrics.cancelled")}</th>
								<th class="text-right">{t("metrics.timeout")}</th>
							</tr>
						}
					>
						<For each={Object.entries(props.stats.jobs)}>
							{([name, counts]) => (
								<tr>
									<td>{t(`metrics.queue.${name}`)}</td>
									<td class="text-right tabular-nums">{counts.completed}</td>
									<td class="text-right tabular-nums">{counts.failed}</td>
									<td class="text-right tabular-nums">{counts.deferred}</td>
									<td class="text-right tabular-nums">{counts.cancelled}</td>
									<td class="text-right tabular-nums">{counts.timeout}</td>
								</tr>
							)}
						</For>
					</Table>
				</CardContent>
			</Card>

			{/* 5. Infrastructure: Database & Redis */}
			<Card>
				<CardHeader title={t("metrics.infrastructure")} />
				<CardContent class="p-0">
					<div class="grid gap-px bg-border lg:grid-cols-2">
						<div class="bg-surface">
							<Table
								head={
									<tr>
										<th>{t("metrics.database")}</th>
										<th class="text-right">{t("metrics.success")}</th>
										<th class="text-right">{t("metrics.failed")}</th>
										<th class="text-right">{t("metrics.cancelled")}</th>
										<th class="text-right">{t("metrics.timeout")}</th>
										<th class="text-right">P95</th>
									</tr>
								}
							>
								<For each={database()}>
									{([key, counts]) => (
										<tr>
											<td>{key}</td>
											<td class="text-right tabular-nums">
												{counts.success}
											</td>
											<td class="text-right tabular-nums">
												{counts.failure}
											</td>
											<td class="text-right tabular-nums">
												{counts.cancelled}
											</td>
											<td class="text-right tabular-nums">
												{counts.timeout}
											</td>
											<td class="text-right tabular-nums">
												{p95(props.stats.database.durationMs[key])}
											</td>
										</tr>
									)}
								</For>
							</Table>
						</div>
						<div class="bg-surface">
							<Table
								head={
									<tr>
										<th>{t("metrics.redis")}</th>
										<th class="text-right">{t("metrics.success")}</th>
										<th class="text-right">{t("metrics.failed")}</th>
										<th class="text-right">{t("metrics.cancelled")}</th>
										<th class="text-right">{t("metrics.timeout")}</th>
										<th class="text-right">P95</th>
									</tr>
								}
							>
								<For each={redis()}>
									{([key, counts]) => (
										<tr>
											<td>{key}</td>
											<td class="text-right tabular-nums">
												{counts.success}
											</td>
											<td class="text-right tabular-nums">
												{counts.failure}
											</td>
											<td class="text-right tabular-nums">
												{counts.cancelled}
											</td>
											<td class="text-right tabular-nums">
												{counts.timeout}
											</td>
											<td class="text-right tabular-nums">
												{p95(props.stats.redis.durationMs[key])}
											</td>
										</tr>
									)}
								</For>
							</Table>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* 6. Discovery Channel Activity */}
			<Card>
				<CardHeader title={t("metrics.discovery")} />
				<CardContent class="p-0">
					<DiscoveryStatsTable byChannel={props.stats.discovery.byChannel} />
				</CardContent>
			</Card>

			{/* 7. Machine Learning Classification Performance */}
			<Card>
				<CardHeader title={t("metrics.labeling")} />
				<CardContent class="p-0">
					<Table
						head={
							<tr>
								<th>{t("metrics.samples")}</th>
								<th class="text-right">TP</th>
								<th class="text-right">FP</th>
								<th class="text-right">TN</th>
								<th class="text-right">FN</th>
								<th class="text-right">{t("metrics.accuracy")}</th>
								<th class="text-right">{t("metrics.precision")}</th>
								<th class="text-right">{t("metrics.recall")}</th>
							</tr>
						}
					>
						<tr>
							<td class="tabular-nums">{props.stats.labeling.samples}</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.truePositive}
							</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.falsePositive}
							</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.trueNegative}
							</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.falseNegative}
							</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.accuracy === null
									? "—"
									: formatPercent(props.stats.labeling.accuracy)}
							</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.precision === null
									? "—"
									: formatPercent(props.stats.labeling.precision)}
							</td>
							<td class="text-right tabular-nums">
								{props.stats.labeling.recall === null
									? "—"
									: formatPercent(props.stats.labeling.recall)}
							</td>
						</tr>
					</Table>
				</CardContent>
			</Card>

			{/* 8. Legacy snapshots metrics (if available) */}
			{props.stats.legacy ? (
				<Card>
					<CardHeader title={t("metrics.legacy")} />
					<CardContent class="p-4">
						<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
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
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
