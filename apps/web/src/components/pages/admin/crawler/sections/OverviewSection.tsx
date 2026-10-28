import { createSignal, For, onMount, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	ClassifierHealthDto,
	CrawlerOverviewStats,
	CrawlerStatsWindow,
	CrawlerStatusDto,
} from "@cvsa/contracts";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { formatMetric, formatPercent, formatWaitSeconds } from "../format";
import { MetricCard, QueueStatusTable, FailureStatusTable } from "../statsView";
import ThroughputChart from "../ThroughputChart";
import { createRequestSequence } from "../videoActions";

type OverviewSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
	loadingStatus: Accessor<boolean>;
	refreshStatus: () => Promise<void>;
};

const WINDOWS: CrawlerStatsWindow[] = ["5m", "15m", "30m", "1h", "6h", "24h", "7d"];

export default function OverviewSection(props: OverviewSectionProps) {
	const t = getComponentT("crawler");
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
		setStatsError(res.ok ? t("common.error") : res.error.message || t("common.error"));
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

	onMount(() => {
		void loadStats();
		void refreshClassifier();
	});

	const windowLabel = (w: CrawlerStatsWindow) => {
		switch (w) {
			case "5m":
				return t("overview.range.5m");
			case "15m":
				return t("overview.range.15m");
			case "30m":
				return t("overview.range.30m");
			case "1h":
				return t("overview.range.1h");
			case "6h":
				return t("overview.range.6h");
			case "24h":
				return t("overview.range.24h");
			case "7d":
				return t("overview.range.7d");
		}
	};

	const healthyAdapterCount = () =>
		props
			.statusData()
			?.adapters.filter(
				(adapter) => adapter.enabled && adapter.healthState.toLowerCase() === "healthy"
			).length ?? 0;

	const totalAdapterCount = () => props.statusData()?.adapters.length ?? 0;

	return (
		<div class="flex flex-col gap-6">
			{/* Top Operational Toolbar */}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-2.5">
					<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
						{t("overview.timeRange")}
					</span>
					<div class="flex items-center border border-border bg-surface-container-low h-8">
						<For each={WINDOWS}>
							{(option) => (
								<button
									type="button"
									class={
										"px-3 h-full text-xs transition-colors select-none font-medium " +
										(statsWindow() === option
											? "bg-primary text-display-inverted"
											: "text-secondary hover:text-primary hover:bg-hover")
									}
									onClick={() => void selectWindow(option)}
								>
									{windowLabel(option)}
								</button>
							)}
						</For>
					</div>
				</div>

				<Button
					size="sm"
					variant="outlined"
					loading={loadingStats() || props.loadingStatus()}
					onClick={() => {
						void loadStats();
						void props.refreshStatus();
						void refreshClassifier();
					}}
					class="gap-1.5 shrink-0"
				>
					<RefreshCw class="w-3.5 h-3.5" />
					<span>{t("common.refresh")}</span>
				</Button>
			</div>

			<Show
				when={stats()}
				fallback={
					<div class="p-12 text-center text-tertiary border border-border bg-surface flex flex-col items-center gap-3">
						<span>
							{loadingStats()
								? t("common.loading")
								: (statsError() ?? t("overview.noData"))}
						</span>
						<Show when={!loadingStats()}>
							<Button size="sm" variant="outlined" onClick={() => void loadStats()}>
								{t("common.retry")}
							</Button>
						</Show>
					</div>
				}
			>
				{(current) => (
					<div class="flex flex-col gap-6">
						{/* Throughput Metrics Grid */}
						<section class="flex flex-col gap-2.5">
							<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
								{t("overview.section.throughput")}
							</span>
							<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
								<MetricCard
									label={t("overview.snapshotsPerMin")}
									value={formatMetric(current().snapshotsPerMin)}
									hint="snapshots/min"
									variant="success"
								/>
								<MetricCard
									label={t("overview.jobsPerSec")}
									value={formatMetric(current().jobsPerSec)}
									hint="jobs/sec"
								/>
								<MetricCard
									label={t("overview.requestsPerSec")}
									value={formatMetric(current().requestsPerSec)}
									hint="req/sec"
								/>
								<MetricCard
									label={t("overview.candidatesPerMin")}
									value={formatMetric(current().candidatesPerMin)}
									hint="scanned/min"
								/>
								<MetricCard
									label={t("overview.inferencesPerSec")}
									value={formatMetric(current().inferencesPerSec)}
									hint="inferences/sec"
								/>
								<MetricCard
									label={t("overview.jobsPerMin")}
									value={formatMetric(current().jobsPerMin)}
									hint="jobs/min"
								/>
							</div>

							<ThroughputChart series={current().series ?? []} />
						</section>

						{/* Component Health & Latency Strip */}
						<section class="bg-surface border border-border p-4 flex flex-wrap items-center justify-between gap-6">
							<div class="flex flex-wrap items-center gap-6">
								{/* Classifier Health */}
								<div class="flex items-center gap-2.5">
									<span class="text-xs font-medium text-secondary">
										{t("overview.classifier.title")}:
									</span>
									<Show
										when={!loadingClassifier() && classifierHealth()}
										fallback={<Badge size="sm">{t("common.loading")}</Badge>}
									>
										{(h) => (
											<Badge
												variant={
													!h().reachable
														? "danger"
														: h().modelsLoaded
															? "success"
															: "warning"
												}
												size="sm"
												dot
											>
												{!h().reachable
													? t("overview.classifier.status.unavailable")
													: h().modelsLoaded
														? t("overview.classifier.status.ready")
														: t("overview.classifier.status.notLoaded")}
											</Badge>
										)}
									</Show>
								</div>

								{/* Adapters Summary */}
								<div class="flex items-center gap-2.5 border-l border-border pl-6">
									<span class="text-xs font-medium text-secondary">
										{t("overview.adapters")}:
									</span>
									<Show
										when={props.statusData()}
										fallback={<Badge size="sm">{t("common.unknown")}</Badge>}
									>
										<Badge
											variant={
												healthyAdapterCount() > 0 ? "success" : "danger"
											}
											size="sm"
											dot
										>
											{t("overview.healthyCount")
												.replace("{healthy}", String(healthyAdapterCount()))
												.replace("{total}", String(totalAdapterCount()))}
										</Badge>
									</Show>
								</div>
							</div>

							{/* P95 Latencies */}
							<div class="flex items-center gap-4 text-xs">
								<span class="text-tertiary uppercase tracking-wider font-semibold">
									{t("overview.latency")}:
								</span>
								<span class="text-secondary">
									API{" "}
									<strong class="text-primary font-semibold">
										{formatMetric(current().latencyMs.apiP95)} ms
									</strong>
								</span>
								<span class="text-border">/</span>
								<span class="text-secondary">
									Task{" "}
									<strong class="text-primary font-semibold">
										{formatMetric(current().latencyMs.taskP95)} ms
									</strong>
								</span>
								<span class="text-border">/</span>
								<span class="text-secondary">
									Model{" "}
									<strong class="text-primary font-semibold">
										{formatMetric(current().latencyMs.inferenceP95)} ms
									</strong>
								</span>
							</div>
						</section>

						{/* Reliability & Failure Analysis */}
						<section class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
									{t("overview.section.errors")} ({windowLabel(statsWindow())})
								</span>
							</div>

							<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
								<MetricCard
									label={t("overview.errorRate")}
									value={formatPercent(current().errorRate)}
									variant={
										current().errorRate > 0.1
											? "danger"
											: current().errorRate > 0.02
												? "warning"
												: "success"
									}
								/>
								<MetricCard
									label={t("overview.retryRate")}
									value={formatPercent(current().retryRate)}
								/>
								<MetricCard
									label={t("overview.successfulAttempts")}
									value={`${current().networkFailures === undefined ? "—" : formatMetric(Math.max(0, current().totalAttempts - (current().networkFailures ?? 0)))} / ${formatMetric(current().totalAttempts)}`}
									hint={
										current().networkFailures === undefined
											? undefined
											: `${formatMetric(current().networkFailures ?? 0)} ${t("overview.totalFailures")}`
									}
								/>
								<MetricCard
									label={t("overview.overdueTracking")}
									value={formatMetric(current().overdueTrackingCount)}
									hint={`${t("overview.maxOverdueLag")}: ${formatWaitSeconds(current().maxOverdueLagSec)}`}
									variant={
										current().overdueTrackingCount > 100 ? "warning" : "default"
									}
								/>
							</div>

							{/* Failure Breakdown - Isomorphic to QueueStatusTable */}
							<FailureStatusTable
								breakdown={current().breakdown}
								totalFailures={current().totalFailures}
								windowLabel={windowLabel(statsWindow())}
							/>
						</section>

						{/* Queue Backlog Section */}
						<section class="flex flex-col gap-2.5">
							<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
								{t("overview.queues.title")}
							</span>
							<QueueStatusTable queues={current().queues} />
						</section>
					</div>
				)}
			</Show>
		</div>
	);
}
