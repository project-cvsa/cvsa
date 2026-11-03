import StatsDetails from "../StatsDetails";
import ComponentStatus from "../ComponentStatus";
import OperationalStatus from "../OperationalStatus";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, Show, type Accessor } from "solid-js";
import Button from "@components/ui/Button";
import Select from "@components/ui/Select";
import Tabs, { type TabItem } from "@components/ui/Tabs";
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
import { formatMetric, formatPercent } from "../format";
import { MetricCard, QueueStatusTable } from "../statsView";
import ThroughputChart from "../ThroughputChart";
import { createRequestSequence } from "../videoActions";

type OverviewTab = "summary" | "metrics" | "runtime";

type OverviewSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
};

const WINDOWS: CrawlerStatsWindow[] = ["5m", "15m", "30m", "1h", "6h", "24h", "7d"];

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
};

function RangeControls(props: RangeControlsProps) {
	const t = getComponentT("crawler:metrics");
	const options = () => [
		...WINDOWS.map((value) => ({ value, label: t(WINDOW_MESSAGE_KEYS[value]) })),
		{ value: "custom", label: t("audit.custom") },
	];
	return (
		<div class="flex flex-wrap items-center gap-2.5">
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

export function OverviewSummary(props: {
	snapshots: number;
	videos: number;
	jobs: number;
	requests: number;
	inferences: number;
	success: number | null;
}) {
	const t = getComponentT("crawler:metrics");
	return (
		<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
			<MetricCard label={t("overview.newSnapshots")} value={formatMetric(props.snapshots)} />
			<MetricCard label={t("overview.newVideos")} value={formatMetric(props.videos)} />
			<MetricCard label={t("overview.jobsPerSec")} value={formatMetric(props.jobs)} />
			<MetricCard label={t("overview.requestsPerSec")} value={formatMetric(props.requests)} />
			<MetricCard
				label={t("overview.inferencesPerSec")}
				value={formatMetric(props.inferences)}
			/>
			<MetricCard
				label={t("overview.successRate")}
				value={props.success === null ? "—" : formatPercent(props.success)}
			/>
		</div>
	);
}

export default function OverviewSection(props: OverviewSectionProps) {
	const t = getComponentT("crawler:metrics");
	const [tab, setTab] = createSignal<OverviewTab>("summary");
	const tabs = (): TabItem<OverviewTab>[] => [
		{ id: "summary", label: t("overview.summary") },
		{ id: "metrics", label: t("overview.metrics") },
		{ id: "runtime", label: t("metrics.runtime") },
	];
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
					/>
				}
			/>

			<Tabs size="sm" items={tabs()} value={tab()} onChange={setTab} />

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
						<Show when={tab() === "summary"}>
							<OverviewSummary
								snapshots={current().counters.videosRecorded}
								videos={current().counters.trackingCreated}
								jobs={jobsCompleted(current())}
								requests={current().counters.httpAttemptsFinished}
								inferences={current().counters.modelInferenceCalls}
								success={current().ratios.logicalRequestSuccess}
							/>
							<ThroughputChart series={current().series} />

							<ComponentStatus
								stats={current()}
								status={props.statusData()}
								classifier={classifierHealth()}
							/>

							<section class="flex flex-col gap-2.5">
								<span class="ts-overline text-tertiary">
									{t("overview.queues.title")}
								</span>
								<QueueStatusTable queues={current().current.queues} />
							</section>
						</Show>
						<Show when={tab() === "metrics"}>
							<StatsDetails stats={current()} quantiles={[0.5, 0.9, 0.95, 0.99]} />
						</Show>
						<Show when={tab() === "runtime"}>
							<OperationalStatus stats={current()} />
						</Show>
					</div>
				)}
			</Show>
		</div>
	);
}
