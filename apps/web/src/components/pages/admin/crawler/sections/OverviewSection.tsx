import StatsDetails from "../StatsDetails";
import ComponentStatus from "../ComponentStatus";
import OperationalStatus from "../OperationalStatus";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, Show, type Accessor } from "solid-js";
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
import { MetricCard, QueueStatusTable } from "../statsView";
import ThroughputChart from "../ThroughputChart";
import { createRequestSequence } from "../videoActions";

type OverviewSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
};

const WINDOWS: CrawlerStatsWindow[] = ["5m", "15m", "30m", "1h", "6h", "24h", "7d"];

const QUANTILE_PRESETS = [
	{ value: "0.5,0.9,0.95,0.99", label: "P50 / P90 / P95 / P99" },
	{ value: "0.5,0.95,0.99", label: "P50 / P95 / P99" },
	{ value: "0.5,0.9,0.99", label: "P50 / P90 / P99" },
	{ value: "0.5,0.99", label: "P50 / P99" },
];

const WINDOW_MESSAGE_KEYS: Record<CrawlerStatsWindow, string> = {
	"5m": "overview.range.5m",
	"15m": "overview.range.15m",
	"30m": "overview.range.30m",
	"1h": "overview.range.1h",
	"6h": "overview.range.6h",
	"24h": "overview.range.24h",
	"7d": "overview.range.7d",
};

type RangeControlsProps = {
	rangeMode: Accessor<string>;
	draftMinutes: Accessor<number>;
	onRangeChange: (value: string) => void;
	onDraftMinutesChange: (value: number) => void;
	onApplyCustom: () => void;
	quantileMode: Accessor<string>;
	onQuantileChange: (value: string) => void;
};

function RangeControls(props: RangeControlsProps) {
	const t = getComponentT("crawler");
	const options = () => [
		...WINDOWS.map((value) => ({ value, label: t(WINDOW_MESSAGE_KEYS[value]) })),
		{ value: "custom", label: t("audit.custom") },
	];
	return (
		<div class="flex flex-wrap items-center gap-2.5">
			<span class="ts-overline text-tertiary">{t("overview.timeRange")}</span>
			<div class="w-36 shrink-0">
				<Select
					size="sm"
					aria-label={t("overview.timeRange")}
					value={props.rangeMode()}
					options={options()}
					onValueChange={(value) => {
						if (value) props.onRangeChange(value);
					}}
				/>
			</div>
			<div class="w-52 shrink-0">
				<Select
					size="sm"
					aria-label={t("metrics.quantiles")}
					value={props.quantileMode()}
					options={QUANTILE_PRESETS}
					onValueChange={(value) => {
						if (value) props.onQuantileChange(value);
					}}
				/>
			</div>
			<Show when={props.rangeMode() === "custom"}>
				<form
					class="flex items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						props.onApplyCustom();
					}}
				>
					<NumberField
						class="w-32"
						size="sm"
						value={props.draftMinutes()}
						min={1}
						max={10080}
						suffix={t("audit.minutes")}
						onChange={props.onDraftMinutesChange}
					/>
					<Button type="submit" size="sm" variant="outlined">
						{t("audit.apply")}
					</Button>
				</form>
			</Show>
		</div>
	);
}

function perMinute(value: number, seconds: number): number {
	return (value * 60) / Math.max(1, seconds);
}

export default function OverviewSection(props: OverviewSectionProps) {
	const t = getComponentT("crawler");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [customMinutes, setCustomMinutes] = createSignal<number | undefined>();
	const [draftMinutes, setDraftMinutes] = createSignal(90);
	const [rangeMode, setRangeMode] = createSignal("1h");
	const [quantileMode, setQuantileMode] = createSignal(QUANTILE_PRESETS[0]?.value ?? "");
	const [statsWindow, setStatsWindow] = createSignal<CrawlerStatsWindow>("1h");
	const [loadingStats, setLoadingStats] = createSignal(false);
	const [statsError, setStatsError] = createSignal<string | null>(null);
	const [classifierHealth, setClassifierHealth] = createSignal<ClassifierHealthDto | null>(null);
	const [loadingClassifier, setLoadingClassifier] = createSignal(false);
	const statsRequests = createRequestSequence();

	const loadStats = async (window = statsWindow()) => {
		const request = statsRequests.start();
		setLoadingStats(true);
		const res = await api.crawler.getStats(window, customMinutes(), quantiles());
		if (!statsRequests.isCurrent(request)) return;
		setLoadingStats(false);
		if (res.ok && res.data) {
			setStats(res.data);
			setStatsError(null);
			return;
		}
		setStatsError(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const quantiles = () =>
		quantileMode()
			.split(",")
			.map(Number)
			.filter((value) => Number.isFinite(value) && value > 0 && value <= 1);

	const changeQuantiles = (value: string) => {
		setQuantileMode(value);
		void loadStats();
	};

	const selectWindow = async (window: CrawlerStatsWindow) => {
		setStatsWindow(window);
		setRangeMode(window);
		setCustomMinutes(undefined);
		await loadStats(window);
	};

	const changeRange = (value: string) => {
		if (value === "custom") {
			setRangeMode(value);
			return;
		}
		const parsed = CrawlerStatsWindowSchema.safeParse(value);
		if (parsed.success) void selectWindow(parsed.data);
	};

	const applyCustomRange = () => {
		const minutes = draftMinutes();
		if (minutes < 1 || minutes > 10080 || !Number.isInteger(minutes)) return;
		setCustomMinutes(minutes);
		void loadStats();
	};

	const rangeText = () =>
		customMinutes()
			? `${customMinutes()} ${t("audit.minutes")}`
			: t(WINDOW_MESSAGE_KEYS[statsWindow()]);

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

	const ratesComplete = (current: CrawlerOverviewStats) => current.coverage.status === "complete";
	const jobsCompleted = (current: CrawlerOverviewStats) =>
		current.jobs.tracking.completed + current.jobs.discovery.completed;

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader
				title={<h2 class="ts-heading-2 whitespace-nowrap">{t("tabs.overview")}</h2>}
				actions={
					<RangeControls
						rangeMode={rangeMode}
						draftMinutes={draftMinutes}
						onRangeChange={changeRange}
						onDraftMinutesChange={setDraftMinutes}
						onApplyCustom={applyCustomRange}
						quantileMode={quantileMode}
						onQuantileChange={changeQuantiles}
					/>
				}
			/>

			<Show when={stats() && statsError()}>
				{(message) => (
					<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
						{message()}
					</div>
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
						<section class="flex flex-col gap-2.5">
							<span class="ts-overline text-tertiary">
								{t("overview.section.throughput")}
							</span>
							<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
								<MetricCard
									label={t("overview.newSnapshots")}
									value={formatMetric(current().counters.videosRecorded)}
									hint={
										ratesComplete(current())
											? `${formatMetric(
													perMinute(
														current().counters.videosRecorded,
														current().range.seconds
													)
												)}${t("metrics.perMinute")}`
											: "—"
									}
									variant="success"
								/>
								<MetricCard
									label={t("overview.newVideos")}
									value={formatMetric(current().counters.trackingCreated)}
									variant="success"
								/>
								<MetricCard
									label={t("overview.jobsPerSec")}
									value={
										ratesComplete(current())
											? `${formatMetric(
													perMinute(
														jobsCompleted(current()),
														current().range.seconds
													)
												)}${t("metrics.perMinute")}`
											: "—"
									}
									hint={t("metrics.completed")}
								/>
								<MetricCard
									label={t("overview.requestsPerSec")}
									value={
										ratesComplete(current())
											? `${formatMetric(
													perMinute(
														current().counters.httpAttemptsFinished,
														current().range.seconds
													)
												)}${t("metrics.perMinute")}`
											: "—"
									}
								/>
								<MetricCard
									label={t("overview.inferencesPerSec")}
									value={
										ratesComplete(current())
											? `${formatMetric(
													perMinute(
														current().counters.modelInferenceCalls,
														current().range.seconds
													)
												)}${t("metrics.perMinute")}`
											: "—"
									}
								/>
								<MetricCard
									label={t("overview.successRate")}
									value={
										current().ratios.logicalRequestSuccess === null
											? "—"
											: formatPercent(
													current().ratios.logicalRequestSuccess ?? 0
												)
									}
									hint={`${t("overview.retryRate")} ${
										current().ratios.egressResendShare === null
											? "—"
											: formatPercent(current().ratios.egressResendShare ?? 0)
									}`}
								/>
							</div>

							<Show when={current().coverage.status !== "complete"}>
								<p class="ts-caption text-secondary">
									{t(`metrics.coverage.${current().coverage.status}`)} ·{" "}
									{current().coverage.coveredMinutes}/{current().coverage.minutes}{" "}
									{t("metrics.minutesCovered")}
								</p>
							</Show>
							<ThroughputChart series={current().series} />
							<StatsDetails stats={current()} quantiles={quantiles()} />
						</section>

						<ComponentStatus
							stats={current()}
							status={props.statusData()}
							classifier={classifierHealth()}
						/>

						<OperationalStatus stats={current()} />

						<section class="flex flex-col gap-3">
							<span class="ts-overline text-tertiary">
								{t("overview.section.errors")} ({rangeText()})
							</span>
							<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
								<MetricCard
									label={t("overview.overdueTracking")}
									value={formatMetric(current().current.tracking.dueNow)}
									hint={formatWaitSeconds(
										current().current.tracking.maxOverdueLagSec
									)}
								/>
								<MetricCard
									label={t("overview.totalAttempts")}
									value={formatMetric(current().counters.httpAttemptsFinished)}
									hint={`${current().counters.httpAttemptsCancelled} ${t("metrics.cancelled")}`}
								/>
								<MetricCard
									label={t("overview.errorRate")}
									value={
										current().ratios.httpTransportSuccess === null
											? "—"
											: formatPercent(
													1 - (current().ratios.httpTransportSuccess ?? 0)
												)
									}
								/>
								<MetricCard
									label={t("metrics.businessErrorCount")}
									value={formatMetric(
										Object.values(current().network).reduce(
											(sum, totals) => sum + totals.businessError,
											0
										)
									)}
								/>
							</div>
						</section>

						<section class="flex flex-col gap-2.5">
							<span class="ts-overline text-tertiary">
								{t("overview.queues.title")}
							</span>
							<QueueStatusTable queues={current().current.queues} />
						</section>
					</div>
				)}
			</Show>
		</div>
	);
}
