import { createSignal, For, onMount, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	ClassifierHealthDto,
	CrawlerOverviewStats,
	CrawlerStatsWindow,
	CrawlerStatusDto,
} from "@cvsa/contracts";
import Activity from "lucide-solid/icons/activity";
import Clock from "lucide-solid/icons/clock";
import Cpu from "lucide-solid/icons/cpu";
import Layers from "lucide-solid/icons/layers";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import ShieldAlert from "lucide-solid/icons/shield-alert";
import Zap from "lucide-solid/icons/zap";
import { formatMetric, formatPercent, formatWaitSeconds } from "../format";
import { MetricCard, QueueStatusTable } from "../statsView";
import { createRequestSequence } from "../videoActions";

type OverviewSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
	loadingStatus: Accessor<boolean>;
	refreshStatus: () => Promise<void>;
};

const WINDOWS: CrawlerStatsWindow[] = ["5m", "1h", "24h"];

export default function OverviewSection(props: OverviewSectionProps) {
	const t = getComponentT("crawler");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [statsWindow, setStatsWindow] = createSignal<CrawlerStatsWindow>("1h");
	const [loadingStats, setLoadingStats] = createSignal(false);
	const [statsError, setStatsError] = createSignal<string | null>(null);
	const [classifierHealth, setClassifierHealth] = createSignal<ClassifierHealthDto | null>(null);
	const [loadingClassifier, setLoadingClassifier] = createSignal(false);
	const statsRequests = createRequestSequence();

	const errorRows = (): ReadonlyArray<{
		key: keyof CrawlerOverviewStats["breakdown"];
		label: string;
	}> => [
		{ key: "timeout", label: t("overview.err.timeout") },
		{ key: "networkFailure", label: t("overview.err.networkFailure") },
		{ key: "httpFailure", label: t("overview.err.httpFailure") },
		{ key: "networkOther", label: t("overview.err.networkOther") },
		{ key: "adapterUnavailable", label: t("overview.err.adapterUnavailable") },
		{ key: "rateLimited412Or429", label: t("overview.err.rateLimited") },
		{ key: "bilibiliBusinessError", label: t("overview.err.bilibiliBusiness") },
		{ key: "inferenceError", label: t("overview.err.inference") },
		{ key: "dbError", label: t("overview.err.db") },
		{ key: "other", label: t("overview.err.other") },
	];

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
			case "1h":
				return t("overview.range.1h");
			case "24h":
				return t("overview.range.24h");
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
			{/* Top Bar: Time Range Selector & Refresh */}
			<div class="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 border border-border">
				<div class="flex items-center gap-3">
					<span class="text-xs uppercase tracking-wider text-tertiary">
						{t("overview.timeRange")}:
					</span>
					<div class="flex items-center border border-border bg-surface-container-low">
						<For each={WINDOWS}>
							{(option) => (
								<button
									type="button"
									class={
										"px-3 py-1 text-xs transition-colors select-none " +
										(statsWindow() === option
											? "bg-primary text-display-inverted font-medium"
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

				<div class="flex items-center gap-2">
					<Button
						size="sm"
						variant="outlined"
						disabled={loadingStats() || props.loadingStatus()}
						onClick={() => {
							void loadStats();
							void props.refreshStatus();
							void refreshClassifier();
						}}
						class="gap-1.5"
					>
						<RefreshCw
							class={"w-3.5 h-3.5 " + (loadingStats() ? "animate-spin" : "")}
						/>
						<span>{loadingStats() ? t("common.refreshing") : t("common.refresh")}</span>
					</Button>
				</div>
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
						<section class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<h3 class="font-[Outfit] uppercase text-xs font-bold tracking-wider text-primary flex items-center gap-2">
									<Zap class="w-4 h-4 text-primary" />
									<span>{t("overview.section.throughput")}</span>
								</h3>
							</div>
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
						</section>

						{/* Errors & Health Grid */}
						<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
							{/* Error Metrics */}
							<Card class="lg:col-span-2">
								<CardHeader
									title={
										<div class="flex items-center gap-2">
											<ShieldAlert class="w-4 h-4 text-error" />
											<span>{t("overview.section.errors")}</span>
										</div>
									}
									description={windowLabel(statsWindow())}
								/>
								<CardContent class="flex flex-col gap-4">
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
												current().overdueTrackingCount > 100
													? "warning"
													: "default"
											}
										/>
									</div>

									{/* Failure Breakdown Table */}
									<div class="cvsa-scroll overflow-x-auto border border-border">
										<table class="w-full text-left ts-caption">
											<thead>
												<tr class="border-b border-border text-tertiary bg-surface-container-high">
													<th class="py-2.5 px-3 uppercase text-xs">
														{t("overview.failureKind")}
													</th>
													<th class="py-2.5 px-3 uppercase text-xs">
														{t("overview.failureCount")}
													</th>
													<th class="py-2.5 px-3 uppercase text-xs">
														{t("overview.share")}
													</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-border">
												<For each={errorRows()}>
													{(row) => {
														const count = () =>
															current().breakdown[row.key] ?? 0;
														const percent = () =>
															current().totalFailures > 0
																? (
																		(count() /
																			current()
																				.totalFailures) *
																		100
																	).toFixed(1) + "%"
																: "0%";
														return (
															<tr class="hover:bg-hover transition-colors">
																<td class="py-2.5 px-3 text-secondary text-xs">
																	{row.label}
																</td>
																<td class="py-2.5 px-3 font-medium text-primary">
																	{count()}
																</td>
																<td class="py-2.5 px-3 text-tertiary">
																	{percent()}
																</td>
															</tr>
														);
													}}
												</For>
											</tbody>
										</table>
									</div>
								</CardContent>
							</Card>

							{/* Components & Model Health */}
							<Card>
								<CardHeader
									title={
										<div class="flex items-center gap-2">
											<Activity class="w-4 h-4 text-primary" />
											<span>{t("overview.section.components")}</span>
										</div>
									}
								/>
								<CardContent class="flex flex-col gap-4">
									{/* Classifier Card */}
									<div class="flex flex-col gap-2">
										<div class="flex items-center justify-between">
											<span class="font-[Outfit] uppercase text-xs font-semibold text-primary flex items-center gap-1.5">
												<Cpu class="w-4 h-4 text-primary" />
												<span>{t("overview.classifier.title")}</span>
											</span>
											<Show
												when={!loadingClassifier() && classifierHealth()}
												fallback={
													<Badge size="sm">{t("common.loading")}</Badge>
												}
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
															? t(
																	"overview.classifier.status.unavailable"
																)
															: h().modelsLoaded
																? t(
																		"overview.classifier.status.ready"
																	)
																: t(
																		"overview.classifier.status.notLoaded"
																	)}
													</Badge>
												)}
											</Show>
										</div>
									</div>

									{/* Adapters Summary */}
									<div class="flex flex-col gap-2">
										<div class="flex items-center justify-between">
											<span class="font-[Outfit] uppercase text-xs font-semibold text-primary flex items-center gap-1.5">
												<Layers class="w-4 h-4 text-primary" />
												<span>{t("overview.adapters")}</span>
											</span>
											<Show
												when={props.statusData()}
												fallback={
													<Badge size="sm">{t("common.unknown")}</Badge>
												}
											>
												<Badge
													variant={
														healthyAdapterCount() > 0
															? "success"
															: "danger"
													}
													size="sm"
													dot
												>
													{t("overview.healthyCount")
														.replace(
															"{healthy}",
															String(healthyAdapterCount())
														)
														.replace(
															"{total}",
															String(totalAdapterCount())
														)}
												</Badge>
											</Show>
										</div>
										<p class="text-caption text-tertiary text-xs">
											{t("overview.adaptersDescription")}
										</p>
									</div>

									{/* Latencies */}
									<div class="flex flex-col gap-2 pt-2 border-t border-border">
										<span class="font-[Outfit] uppercase text-xs font-semibold text-tertiary">
											{t("overview.latency")}
										</span>
										<div class="grid grid-cols-3 gap-2 text-center">
											<div class="py-2">
												<span class="text-[11px] uppercase text-tertiary block">
													{t("overview.apiP95")}
												</span>
												<span class="text-sm font-semibold text-primary">
													{formatMetric(current().latencyMs.apiP95)} ms
												</span>
											</div>
											<div class="py-2">
												<span class="text-[11px] uppercase text-tertiary block">
													{t("overview.taskP95")}
												</span>
												<span class="text-sm font-semibold text-primary">
													{formatMetric(current().latencyMs.taskP95)} ms
												</span>
											</div>
											<div class="py-2">
												<span class="text-[11px] uppercase text-tertiary block">
													{t("overview.inferenceP95")}
												</span>
												<span class="text-sm font-semibold text-primary">
													{formatMetric(current().latencyMs.inferenceP95)}{" "}
													ms
												</span>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Queue Backlog Section */}
						<section class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<h3 class="font-[Outfit] uppercase text-xs font-bold tracking-wider text-primary flex items-center gap-2">
									<Clock class="w-4 h-4 text-primary" />
									<span>{t("overview.queues.title")}</span>
								</h3>
							</div>
							<QueueStatusTable queues={current().queues} />
						</section>
					</div>
				)}
			</Show>
		</div>
	);
}
