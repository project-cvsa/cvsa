import ComponentStatus from "../ComponentStatus";
import Table from "@components/ui/Table";
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
import { MetricCard, QueueStatusTable, FailureStatusTable } from "../statsView";
import ThroughputChart from "../ThroughputChart";
import { createRequestSequence } from "../videoActions";

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
	const t = getComponentT("crawler");
	const options = () => [
		...WINDOWS.map((value) => ({ value, label: t(WINDOW_MESSAGE_KEYS[value]) })),
		{ value: "custom", label: t("audit.custom") },
	];
	return (
		<div class="flex flex-nowrap items-center gap-2.5 whitespace-nowrap">
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

function ErrorRateTable(props: { stats: CrawlerOverviewStats }) {
	const t = getComponentT("crawler");
	return (
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
				<td>{formatMetric(props.stats.totalAttempts)}</td>
				<td>{formatPercent(props.stats.errorRate)}</td>
				<td>{formatPercent(props.stats.retryRate)}</td>
				<td>{formatMetric(props.stats.overdueTrackingCount)}</td>
				<td>{formatWaitSeconds(props.stats.maxOverdueLagSec)}</td>
			</tr>
		</Table>
	);
}

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

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader
				nowrap
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
									value={formatMetric(current().snapshotsSaved ?? 0)}
									hint={`平均 ${formatMetric(current().snapshotsPerMin)}/分`}
									variant="success"
								/>
								<MetricCard
									label={t("overview.newVideos")}
									value={formatMetric(current().videosDiscovered ?? 0)}
									hint={t("overview.discoveredHint")}
									variant="success"
								/>
								<MetricCard
									label={t("overview.jobsPerSec")}
									value={`${formatMetric(current().jobsPerSec)}/s`}
									hint={`约 ${formatMetric(current().jobsPerMin)}/分`}
								/>
								<MetricCard
									label={t("overview.requestsPerSec")}
									value={`${formatMetric(current().requestsPerSec)}/s`}
									hint={t("overview.unit.requestsPerSec")}
								/>
								<MetricCard
									label={t("overview.inferencesPerSec")}
									value={`${formatMetric(current().inferencesPerSec)}/s`}
									hint={t("overview.unit.inferencesPerSec")}
								/>
								<MetricCard
									label={t("overview.successRate")}
									value={formatPercent(1 - current().errorRate)}
									hint={`重试率 ${formatPercent(current().retryRate)}`}
								/>
							</div>

							<ThroughputChart series={current().series ?? []} />
						</section>

						<ComponentStatus
							stats={current()}
							status={props.statusData()}
							classifier={classifierHealth()}
						/>

						<section class="flex flex-col gap-3">
							<span class="ts-overline text-tertiary">
								{t("overview.section.errors")} ({rangeText()})
							</span>

							<ErrorRateTable stats={current()} />

							<FailureStatusTable
								breakdown={current().breakdown}
								totalFailures={current().totalFailures}
								windowLabel={rangeText()}
							/>
						</section>

						<section class="flex flex-col gap-2.5">
							<span class="ts-overline text-tertiary">
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
