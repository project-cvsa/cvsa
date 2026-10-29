import ComponentStatus from "../ComponentStatus";
import Table from "@components/ui/Table";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import Select from "@components/ui/Select";
import NumberField from "@components/ui/NumberField";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	ClassifierHealthDto,
	CrawlerOverviewStats,
	CrawlerStatsWindow,
	CrawlerStatusDto,
} from "@cvsa/contracts";
import { CrawlerStatsWindowSchema } from "@cvsa/contracts";
import { formatMetric, formatPercent, formatWaitSeconds } from "../format";
import { MetricCard, QueueStatusTable, FailureStatusTable } from "../statsView";
import ThroughputChart from "../ThroughputChart";
import { createRequestSequence } from "../videoActions";

type OverviewSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
};

const WINDOWS: CrawlerStatsWindow[] = ["5m", "15m", "30m", "1h", "6h", "24h", "7d"];

export default function OverviewSection(props: OverviewSectionProps) {
	const t = getComponentT("crawler");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [customMinutes, setCustomMinutes] = createSignal<number | undefined>();
	const [draftMinutes, setDraftMinutes] = createSignal(90);
	const [rangeMode, setRangeMode] = createSignal("1h");
	const [statsWindow, setStatsWindow] = createSignal<CrawlerStatsWindow>("1h");
	const [loadingStats, setLoadingStats] = createSignal(false);
	const [statsError, setStatsError] = createSignal<string | null>(null);
	const [classifierHealth, setClassifierHealth] = createSignal<ClassifierHealthDto | null>(null);
	const [loadingClassifier, setLoadingClassifier] = createSignal(false);
	const statsRequests = createRequestSequence();

	const loadStats = async (window = statsWindow()) => {
		const request = statsRequests.start();
		setLoadingStats(true);
		const res = await api.crawler.getStats(window, customMinutes());
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
		setRangeMode(window);
		setCustomMinutes(undefined);
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

	useCrawlerRefresh("overview", () => {
		if (!loadingStats()) void loadStats();
		if (!loadingClassifier()) void refreshClassifier();
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

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader
				nowrap
				title={<h2 class="text-sm whitespace-nowrap">{t("tabs.overview")}</h2>}
				actions={
					<div class="flex flex-nowrap items-center gap-2.5 whitespace-nowrap">
						<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
							{t("overview.timeRange")}
						</span>
						<div class="w-36 shrink-0">
							<Select
								size="sm"
								aria-label={t("overview.timeRange")}
								value={rangeMode()}
								options={[
									...WINDOWS.map((value) => ({
										value,
										label: windowLabel(value),
									})),
									{ value: "custom", label: t("audit.custom") },
								]}
								onValueChange={(value) => {
									if (value === "custom") setRangeMode(value);
									else {
										const parsed = CrawlerStatsWindowSchema.safeParse(value);
										if (parsed.success) void selectWindow(parsed.data);
									}
								}}
							/>
						</div>
						<Show when={rangeMode() === "custom"}>
							<form
								class="flex items-center gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									if (
										draftMinutes() >= 1 &&
										draftMinutes() <= 10080 &&
										Number.isInteger(draftMinutes())
									) {
										setCustomMinutes(draftMinutes());
										void loadStats();
									}
								}}
							>
								<NumberField
									class="w-32"
									size="sm"
									value={draftMinutes()}
									min={1}
									max={10080}
									suffix={t("audit.minutes")}
									onChange={setDraftMinutes}
								/>
								<Button type="submit" size="sm" variant="outlined">
									{t("audit.apply")}
								</Button>
							</form>
						</Show>
					</div>
				}
			/>

			<Show when={stats() && statsError()}>
				{(message) => (
					<p role="alert" class="text-error text-sm">
						{message()}
					</p>
				)}
			</Show>
			<Show
				when={stats()}
				fallback={
					<div class="p-12 text-center text-tertiary bg-surface flex flex-col items-center gap-3">
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
							<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
								<MetricCard
									label={t("overview.snapshotsPerMin")}
									value={formatMetric(current().snapshotsPerMin)}
									hint="snapshots/min"
									variant="success"
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

						<ComponentStatus
							stats={current()}
							status={props.statusData()}
							classifier={classifierHealth()}
						/>

						{/* Reliability & Failure Analysis */}
						<section class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
									{t("overview.section.errors")} (
									{customMinutes()
										? `${customMinutes()} ${t("audit.minutes")}`
										: windowLabel(statsWindow())}
									)
								</span>
							</div>

							<Table
								head={
									<tr>
										<th>{t("overview.totalAttempts")}</th>
										<th>{t("overview.errorRate")}</th>
										<th>{t("overview.retryRate")}</th>
										<th>{t("overview.overdueTracking")}</th>
										<th>{t("overview.maxOverdueLag")}</th>
									</tr>
								}
							>
								<tr>
									<td>{formatMetric(current().totalAttempts)}</td>
									<td>{formatPercent(current().errorRate)}</td>
									<td>{formatPercent(current().retryRate)}</td>
									<td>{formatMetric(current().overdueTrackingCount)}</td>
									<td>{formatWaitSeconds(current().maxOverdueLagSec)}</td>
								</tr>
							</Table>

							{/* Failure Breakdown - Isomorphic to QueueStatusTable */}
							<FailureStatusTable
								breakdown={current().breakdown}
								totalFailures={current().totalFailures}
								windowLabel={
									customMinutes()
										? `${customMinutes()} ${t("audit.minutes")}`
										: windowLabel(statsWindow())
								}
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
