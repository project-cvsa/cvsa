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
			?.adapters.filter((adapter) => adapter.healthState.toLowerCase() === "healthy")
			.length ?? 0;

	const totalAdapterCount = () => props.statusData()?.adapters.length ?? 0;

	return (
		<div class="flex flex-col gap-6">
			{/* Top Bar: Time Range Selector & Refresh */}
			<div class="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-lg border border-border">
				<div class="flex items-center gap-3">
					<span class="ts-caption text-tertiary">{t("overview.timeRange")}:</span>
					<div class="flex items-center gap-1.5 bg-surface-container-high/40 p-1 rounded-md border border-border">
						<For each={WINDOWS}>
							{(option) => (
								<button
									type="button"
									class={
										"px-3 py-1 rounded text-xs font-medium transition-colors select-none " +
										(statsWindow() === option
											? "bg-primary text-display-inverted shadow-xs"
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
					<div class="p-12 text-center text-tertiary border border-border rounded-lg bg-surface">
						{loadingStats()
							? t("common.loading")
							: (statsError() ?? t("common.unknown"))}
					</div>
				}
			>
				{(current) => (
					<div class="flex flex-col gap-6">
						{/* Throughput Metrics Grid */}
						<section class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<h3 class="ts-subhead font-semibold text-primary flex items-center gap-2">
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
											label={t("overview.totalAttempts")}
											value={formatMetric(current().totalAttempts)}
											hint={`${formatMetric(current().totalFailures)} ${t("overview.totalFailures")}`}
										/>
										<MetricCard
											label={t("overview.overdueTracking")}
											value={formatMetric(current().overdueTrackingCount)}
											hint={`Max lag: ${formatWaitSeconds(current().maxOverdueLagSec)}`}
											variant={
												current().overdueTrackingCount > 100
													? "warning"
													: "default"
											}
										/>
									</div>

									{/* Failure Breakdown Table */}
									<div class="overflow-x-auto border border-border rounded-lg">
										<table class="w-full text-left ts-caption">
											<thead>
												<tr class="border-b border-border text-tertiary bg-surface-container-high/30">
													<th class="py-2 px-3 font-medium">
														{t("overview.failureKind")}
													</th>
													<th class="py-2 px-3 font-medium">
														{t("overview.failureCount")}
													</th>
													<th class="py-2 px-3 font-medium">占比</th>
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
																<td class="py-2 px-3 text-secondary">
																	{row.label}
																</td>
																<td class="py-2 px-3 font-mono font-medium text-primary">
																	{count()}
																</td>
																<td class="py-2 px-3 font-mono text-tertiary">
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
									<div class="p-3.5 rounded-lg border border-border bg-surface-container-high/20 flex flex-col gap-2">
										<div class="flex items-center justify-between">
											<span class="ts-label font-medium text-primary flex items-center gap-1.5">
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
										<p class="ts-caption text-tertiary text-xs">
											In-process HuggingFace Tokenizer &amp; ONNX Runtime
										</p>
									</div>

									{/* Adapters Summary */}
									<div class="p-3.5 rounded-lg border border-border bg-surface-container-high/20 flex flex-col gap-2">
										<div class="flex items-center justify-between">
											<span class="ts-label font-medium text-primary flex items-center gap-1.5">
												<Layers class="w-4 h-4 text-primary" />
												<span>Network Adapters</span>
											</span>
											<Badge
												variant={
													healthyAdapterCount() > 0 ? "success" : "danger"
												}
												size="sm"
												dot
											>
												{healthyAdapterCount()} / {totalAdapterCount()}{" "}
												Healthy
											</Badge>
										</div>
										<p class="ts-caption text-tertiary text-xs">
											Egress routes balanced with circuit-breaker protection
										</p>
									</div>

									{/* Latencies */}
									<div class="flex flex-col gap-2 pt-2 border-t border-border">
										<span class="ts-caption text-tertiary font-medium">
											Latency P95
										</span>
										<div class="grid grid-cols-3 gap-2 text-center">
											<div class="p-2 rounded bg-surface-container-high/30 border border-border">
												<span class="text-[11px] text-tertiary block">
													API P95
												</span>
												<span class="font-mono text-sm font-medium text-primary">
													{formatMetric(current().latencyMs.apiP95)} ms
												</span>
											</div>
											<div class="p-2 rounded bg-surface-container-high/30 border border-border">
												<span class="text-[11px] text-tertiary block">
													Task P95
												</span>
												<span class="font-mono text-sm font-medium text-primary">
													{formatMetric(current().latencyMs.taskP95)} ms
												</span>
											</div>
											<div class="p-2 rounded bg-surface-container-high/30 border border-border">
												<span class="text-[11px] text-tertiary block">
													Model P95
												</span>
												<span class="font-mono text-sm font-medium text-primary">
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
								<h3 class="ts-subhead font-semibold text-primary flex items-center gap-2">
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
