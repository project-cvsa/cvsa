import { createSignal, For, onMount, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import { api } from "@lib/api";
import type {
	ClassifierHealthDto,
	CrawlerOverviewStats,
	CrawlerStatsWindow,
	CrawlerStatusDto,
} from "@cvsa/contracts";
import { formatDateTime, formatMetric, formatPercent, formatWaitSeconds } from "../format";
import { readSeriesMetrics } from "../seriesMetrics";
import { MetricCard, QueueStatusTable } from "../statsView";
import { createRequestSequence } from "../videoActions";

type OverviewSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
	loadingStatus: Accessor<boolean>;
	refreshStatus: () => Promise<void>;
};

const WINDOWS: CrawlerStatsWindow[] = ["5m", "1h", "24h"];

const ERROR_ROWS: ReadonlyArray<{
	key: keyof CrawlerOverviewStats["breakdown"];
	label: string;
}> = [
	{ key: "timeout", label: "Timeout" },
	{ key: "rateLimited412Or429", label: "Rate limited (412/429)" },
	{ key: "bilibiliBusinessError", label: "Bilibili business error" },
	{ key: "inferenceError", label: "Inference error" },
	{ key: "dbError", label: "Database error" },
	{ key: "other", label: "Other" },
];

export default function OverviewSection(props: OverviewSectionProps) {
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [statsWindow, setStatsWindow] = createSignal<CrawlerStatsWindow>("1h");
	const [loadingStats, setLoadingStats] = createSignal(false);
	const [statsError, setStatsError] = createSignal<string | null>(null);
	const [classifierHealth, setClassifierHealth] = createSignal<ClassifierHealthDto | null>(null);
	const [loadingClassifier, setLoadingClassifier] = createSignal(false);
	const statsRequests = createRequestSequence();

	const loadStats = async (window = statsWindow()) => {
		const request = statsRequests.start();
		setLoadingStats(true);
		const res = await api.crawler.getStats(window);
		if (!statsRequests.isCurrent(request)) return;
		setLoadingStats(false);
		if (res.ok && res.data) {
			setStats(res.data);
			setStatsError(null);
			return;
		}
		setStatsError(res.ok ? "No stats" : res.error.message || "Stats unavailable");
	};

	const selectWindow = async (window: CrawlerStatsWindow) => {
		setStatsWindow(window);
		await loadStats(window);
	};

	const refreshClassifier = async () => {
		setLoadingClassifier(true);
		const res = await api.crawler.getClassifierHealth();
		setLoadingClassifier(false);
		if (res.ok && res.data) {
			setClassifierHealth(res.data);
			return;
		}
		setClassifierHealth({ reachable: false, modelsLoaded: null });
	};

	const classifierState = () => {
		const health = classifierHealth();
		if (health === null) return "Unknown";
		if (!health.reachable) return "Unavailable";
		if (health.modelsLoaded === true) return "Ready";
		if (health.modelsLoaded === false) return "No models loaded";
		return "Unknown";
	};

	const classifierReachability = () => {
		const health = classifierHealth();
		if (health === null) return "Unknown";
		return health.reachable ? "Reachable" : "Unreachable";
	};

	const healthyAdapterCount = () =>
		props
			.statusData()
			?.adapters.filter((adapter) => adapter.healthState.toLowerCase() === "healthy")
			.length ?? 0;

	const orderedSeries = () =>
		[...(stats()?.series ?? [])].sort((left, right) =>
			left.bucketTime.localeCompare(right.bucketTime)
		);
	const recentSeries = () => orderedSeries().slice(-6).reverse();
	const seriesGroups = () => [
		...new Set((stats()?.series ?? []).map((point) => point.metricGroup)),
	];
	const latestSeriesTime = () => {
		const points = orderedSeries();
		return points.length > 0 ? points[points.length - 1].bucketTime : null;
	};

	onMount(() => {
		void loadStats();
		void refreshClassifier();
	});

	return (
		<div class="flex flex-col gap-6">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="ts-heading-2 text-primary">Overview</h2>
				<div class="flex flex-wrap items-center gap-2">
					<fieldset class="flex gap-1 border-0 p-0 m-0 min-w-0">
						<legend class="sr-only">Stats window</legend>
						<For each={WINDOWS}>
							{(option) => (
								<Button
									size="sm"
									variant={statsWindow() === option ? "filled" : "outlined"}
									aria-pressed={statsWindow() === option}
									onClick={() => void selectWindow(option)}
								>
									{option}
								</Button>
							)}
						</For>
					</fieldset>
					<Button
						size="sm"
						variant="outlined"
						disabled={loadingStats() || props.loadingStatus()}
						onClick={() => {
							void loadStats();
							void props.refreshStatus();
						}}
					>
						{loadingStats() || props.loadingStatus() ? "Refreshing" : "Refresh"}
					</Button>
				</div>
			</div>

			<Show
				when={stats()}
				fallback={
					<div class="p-8 text-center text-tertiary border border-border rounded">
						{loadingStats()
							? "Loading"
							: statsError() !== null
								? statsError()
								: "No stats"}
					</div>
				}
			>
				{(current) => (
					<div class="flex flex-col gap-6">
						<section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<MetricCard
								label="Jobs / second"
								value={formatMetric(current().jobsPerSec)}
							/>
							<MetricCard
								label="Jobs / minute"
								value={formatMetric(current().jobsPerMin)}
							/>
							<MetricCard
								label="Snapshots / minute"
								value={formatMetric(current().snapshotsPerMin)}
							/>
							<MetricCard
								label="Candidates / minute"
								value={formatMetric(current().candidatesPerMin)}
							/>
							<MetricCard
								label="Inferences / second"
								value={formatMetric(current().inferencesPerSec)}
							/>
							<MetricCard
								label="Requests / second"
								value={formatMetric(current().requestsPerSec)}
							/>
						</section>

						<section class="flex flex-col gap-3">
							<h3 class="ts-subhead font-semibold text-primary">Errors</h3>
							<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
								<MetricCard
									label="Error rate"
									value={formatPercent(current().errorRate)}
								/>
								<MetricCard
									label="Retry rate"
									value={formatPercent(current().retryRate)}
								/>
								<MetricCard
									label="Attempts"
									value={formatMetric(current().totalAttempts)}
									hint={`${formatMetric(current().totalFailures)} failed`}
								/>
								<MetricCard
									label="Overdue tracking"
									value={formatMetric(current().overdueTrackingCount)}
									hint={`Max lag ${formatWaitSeconds(current().maxOverdueLagSec)}`}
								/>
							</div>
							<div class="overflow-x-auto border border-border rounded">
								<table class="w-full text-left ts-caption">
									<thead>
										<tr class="border-b border-border text-tertiary">
											<th class="py-2 px-3">Failure kind</th>
											<th class="py-2 px-3">Count</th>
										</tr>
									</thead>
									<tbody>
										<For each={ERROR_ROWS}>
											{(row) => (
												<tr class="border-b border-border hover:bg-hover">
													<td class="py-2 px-3 text-secondary">
														{row.label}
													</td>
													<td class="py-2 px-3 font-mono text-primary">
														{current().breakdown[row.key]}
													</td>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
						</section>

						<section class="flex flex-col gap-3">
							<h3 class="ts-subhead font-semibold text-primary">
								Backlog &amp; latency
							</h3>
							<QueueStatusTable queues={current().queues} />
							<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
								<MetricCard
									label="Task P95"
									value={`${formatMetric(current().latencyMs.taskP95)} ms`}
								/>
								<MetricCard
									label="API P95"
									value={`${formatMetric(current().latencyMs.apiP95)} ms`}
								/>
								<MetricCard
									label="Inference P95"
									value={`${formatMetric(current().latencyMs.inferenceP95)} ms`}
								/>
							</div>
						</section>

						<section class="flex flex-col gap-3">
							<h3 class="ts-subhead font-semibold text-primary">Health</h3>
							<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
								<MetricCard
									label="Runtime"
									value={props.statusData()?.ready ? "Ready" : "Not ready"}
									hint={`Revision ${props.statusData()?.revision ?? "—"}`}
								/>
								<MetricCard
									label="Adapters"
									value={`${healthyAdapterCount()} / ${props.statusData()?.adapters.length ?? 0}`}
									hint={`${
										props
											.statusData()
											?.adapters.filter((adapter) => adapter.enabled)
											.length ?? 0
									} enabled`}
								/>
								<div class="p-4 rounded border border-border flex flex-col gap-1">
									<div class="flex items-center justify-between gap-2">
										<span class="ts-caption text-tertiary">Classifier</span>
										<Button
											size="sm"
											variant="outlined"
											disabled={loadingClassifier()}
											onClick={() => void refreshClassifier()}
										>
											{loadingClassifier() ? "Checking" : "Check"}
										</Button>
									</div>
									<span class="ts-heading-3 font-semibold text-primary">
										{classifierState()}
									</span>
									<span class="ts-caption text-tertiary">
										{classifierReachability()}
									</span>
								</div>
							</div>
						</section>

						<section class="flex flex-col gap-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<h3 class="ts-subhead font-semibold text-primary">Rollup series</h3>
								<span class="ts-caption text-tertiary">
									{current().series.length} buckets · latest{" "}
									{formatDateTime(latestSeriesTime())}
								</span>
							</div>
							<Show
								when={recentSeries().length > 0}
								fallback={
									<div class="p-6 text-center text-tertiary border border-border rounded">
										No rollups
									</div>
								}
							>
								<div class="overflow-x-auto border border-border rounded">
									<table class="w-full text-left ts-caption">
										<thead>
											<tr class="border-b border-border text-tertiary">
												<th class="py-2 px-3">Bucket</th>
												<th class="py-2 px-3">Group</th>
												<th class="py-2 px-3">Counters</th>
											</tr>
										</thead>
										<tbody>
											<For each={recentSeries()}>
												{(point) => (
													<tr class="border-b border-border hover:bg-hover">
														<td class="py-2 px-3 text-tertiary">
															{formatDateTime(point.bucketTime)}
														</td>
														<td class="py-2 px-3 font-mono text-primary">
															{point.metricGroup}
														</td>
														<td class="py-2 px-3 text-secondary">
															<Show
																when={
																	readSeriesMetrics(point.metrics)
																		.length > 0
																}
																fallback="—"
															>
																<For
																	each={readSeriesMetrics(
																		point.metrics
																	)}
																>
																	{(metric, index) => (
																		<span>
																			{index() > 0
																				? " · "
																				: ""}
																			{metric.label}{" "}
																			{formatMetric(
																				metric.value
																			)}
																		</span>
																	)}
																</For>
															</Show>
														</td>
													</tr>
												)}
											</For>
										</tbody>
									</table>
								</div>
							</Show>
							<Show when={seriesGroups().length > 0}>
								<div class="ts-caption text-tertiary">
									Groups ·{" "}
									<span class="text-primary">{seriesGroups().join(", ")}</span>
								</div>
							</Show>
						</section>
					</div>
				)}
			</Show>
		</div>
	);
}
