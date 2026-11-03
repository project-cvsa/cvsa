import { describe, expect, test } from "vitest";
import { renderToString } from "solid-js/web";
import type { JSX } from "solid-js";
import type { DiscoveryActivity } from "@cvsa/contracts";
import { CRAWLER_STATS_OPERATIONS, CRAWLER_STATS_OUTCOMES } from "@cvsa/contracts";
import { ComponentI18nProvider } from "@lib/i18n/component-context";
import { i18nServer } from "@lib/i18n/server";
import { DiscoveryStatsTable } from "../src/components/pages/admin/crawler/DiscoveryStats";
import DiscoveryActivityView from "../src/components/pages/admin/crawler/discovery/DiscoveryActivity";
import { LatencyTable } from "../src/components/pages/admin/crawler/statsView";
import ThroughputChart, { TrendPlot } from "../src/components/pages/admin/crawler/ThroughputChart";
import OverviewSection, {
	OverviewSummary,
} from "../src/components/pages/admin/crawler/sections/OverviewSection";
import CrawlerExecutionPolicy from "../src/components/pages/admin/crawler/settings/CrawlerExecutionPolicy";
import { CrawlerExecutionConfigSchema } from "@cvsa/contracts";
import { QueueJobsTable } from "../src/components/pages/admin/crawler/sections/TasksSection";
import NetworkSessionPolicy from "../src/components/pages/admin/crawler/network/NetworkSessionPolicy";
import LabelingStats from "../src/components/pages/admin/crawler/LabelingStats";
import VideoSnapshotHistory from "../src/components/pages/admin/crawler/videoDetail/VideoSnapshotHistory";

function render(locale: string, content: () => JSX.Element) {
	return renderToString(() => (
		<ComponentI18nProvider
			getT={(namespace) => i18nServer.getT({ locale, namespace: `client:${namespace}` })}
		>
			{content()}
		</ComponentI18nProvider>
	));
}

describe("crawler console translations", () => {
	test.each([
		{
			locale: "en-US",
			snapshot: "Snapshots",
			history: "Snapshot history",
			labels: "Labeled samples",
		},
		{ locale: "zh-CN", snapshot: "快照", history: "快照历史", labels: "标注样本" },
	])(
		"uses the domain terms for snapshots and labeled samples in $locale",
		({ locale, snapshot, history, labels }) => {
			const html = render(locale, () => (
				<>
					<OverviewSummary
						snapshots={123}
						videos={4}
						jobs={5}
						requests={6}
						inferences={7}
						success={1}
					/>
					<VideoSnapshotHistory
						snapshots={() => ({ items: [], total: 0 })}
						snapshotsTotal={() => 0}
						snapshotsPage={() => 0}
						snapshotsError={() => null}
						loadingSnapshots={() => false}
						loadSnapshotsPage={async () => {}}
						pageSize={20}
					/>
					<LabelingStats />
				</>
			));
			for (const value of [snapshot, history, labels]) expect(html).toContain(value);
			expect(html).not.toContain("Stats records");
			expect(html).not.toContain("采集记录");
		}
	);
	test("uses the existing tabs for overview navigation and a modal action for session options", () => {
		const html = render("en-US", () => (
			<>
				<OverviewSection statusData={() => null} />
				<NetworkSessionPolicy onChange={() => {}} />
			</>
		));
		for (const label of ["Summary", "Metrics", "Runtime", "Session options"])
			expect(html).toContain(label);
		expect(html).toContain('role="tablist"');
		expect(html).not.toContain("<details");
		expect(html).not.toContain("<summary");
	});
	test("bounds percentage charts at 100 and includes dates for multi-day ranges", () => {
		const html = render("en-US", () => (
			<TrendPlot
				width={800}
				lines={[
					{
						label: "Success",
						color: "currentColor",
						points: [
							{ time: Date.UTC(2026, 10, 1), value: 0.9 },
							{ time: Date.UTC(2026, 10, 3), value: 0.8 },
						],
					},
				]}
				label="Success"
				unit="%"
				format="percent"
			/>
		));
		expect(html).toContain("100</text>");
		expect(html).not.toContain("110</text>");
		expect(html).toContain("11/01");
		expect(html).toContain("11/03");
	});
	test("keeps long database errors in task details and gives the list a short summary", () => {
		const html = render("en-US", () => (
			<QueueJobsTable
				busy={false}
				onInspect={() => {}}
				items={[
					{
						id: "259371",
						queue: "discovery",
						name: "detail-408177762",
						target: "408177762",
						state: "failed",
						attempts: 1,
						timestamp: Date.UTC(2026, 10, 3),
						failedReason: `Failed query: select ${"column, ".repeat(100)} from video_tracking`,
					},
				]}
			/>
		));
		expect(html).toContain("Database query failed");
		expect(html).not.toContain("column, column");
		expect(html).toContain("259371");
	});
	test("keeps the overview filter limited to the time range", () => {
		const html = render("en-US", () => <OverviewSection statusData={() => null} />);
		expect(html).not.toContain("P50");
		expect(html).not.toContain("Quantiles");
	});
	test("shows short headline labels and recorded counts without empty rate hints", () => {
		const html = render("en-US", () => (
			<OverviewSummary
				snapshots={36626}
				videos={115}
				jobs={400}
				requests={2127}
				inferences={103}
				success={0.893}
			/>
		));
		for (const value of ["Snapshots", "New tracking", "36626", "2127", "89.3%"])
			expect(html).toContain(value);
		expect(html).not.toContain("—");
		expect(html).not.toContain("Candidates accepted for tracking");
	});
	test("shows four colored percentile lines and their legends for request duration", () => {
		const series = [0, 1, 2].map(
			(minute) =>
				({
					bucketTime: new Date(Date.UTC(2026, 10, 3, 12, minute)).toISOString(),
					metricGroup: "crawler:minute",
					coverage: "complete",
					metrics: {
						"latency.httpAttempt.0.5": 10 + minute,
						"latency.httpAttempt.0.9": 20 + minute,
						"latency.httpAttempt.0.95": 30 + minute,
						"latency.httpAttempt.0.99": 40 + minute,
					},
				}) satisfies import("@cvsa/contracts").CrawlerStatsRollupPoint
		);
		const html = render("en-US", () => (
			<ThroughputChart series={series} initialMetric="latency.httpAttempt" />
		));
		for (const percentile of ["P50", "P90", "P95", "P99"]) {
			expect(html).toContain(`<title>${percentile}</title>`);
			expect(html).toContain(`var(--chart-${percentile.toLowerCase()})`);
		}
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
	});
	test("uses compact numeric axis labels and keeps units outside ticks", () => {
		const html = render("en-US", () => (
			<TrendPlot
				width={320}
				lines={[
					{
						label: "Snapshots",
						color: "currentColor",
						points: [
							{ time: 1000, value: 1040050.5 },
							{ time: 61000, value: null },
							{ time: 121000, value: 5000 },
						],
					},
				]}
				label="Snapshots"
				unit="/min"
				format="number"
			/>
		));
		expect(html).not.toContain("/min</text>");
		expect(html).not.toContain("1040050.5</text>");
		expect(html).toContain("1.1M</text>");
		expect(html).not.toContain("NaN");
	});
	test("renders worker and tracking controls together without the network timeout", () => {
		const html = render("en-US", () => (
			<CrawlerExecutionPolicy
				config={CrawlerExecutionConfigSchema.parse({})}
				onChange={() => {}}
			/>
		));
		for (const label of [
			"Snapshot workers",
			"Discovery workers",
			"Lateness alert (s)",
			"Retry delay (s)",
		])
			expect(html).toContain(label);
		expect(html).not.toContain("HTTP timeout");
		expect(html).not.toContain("scheduling.");
	});
	test.each(["en-US", "zh-CN"])(
		"renders every measured operation and outcome in %s",
		(locale) => {
			const summary = {
				count: 1,
				mean: 10,
				min: 10,
				max: 10,
				quantiles: { "0.5": 10, "0.95": 10 },
			};
			const latency = Object.fromEntries(
				CRAWLER_STATS_OPERATIONS.flatMap((operation) =>
					CRAWLER_STATS_OUTCOMES.map((outcome) => [`${operation}:${outcome}`, summary])
				)
			);
			const html = render(locale, () => (
				<LatencyTable latency={latency} quantiles={[0.5, 0.95]} />
			));
			expect(html).toContain("P95");
			expect(html).toContain(locale === "en-US" ? ">Count</th>" : ">次数</th>");
			expect(html).not.toContain("metrics.");
		}
	);
	test.each([
		{
			locale: "en-US",
			title: "Discovery sources",
			search: "Search",
			related: "Related videos",
			manual: "Manual",
			hot: "Related samples",
		},
		{
			locale: "zh-CN",
			title: "发现来源",
			search: "搜索",
			related: "相关推荐",
			manual: "手动添加",
			hot: "热门视频推荐",
		},
	])(
		"renders every discovery source in $locale",
		({ locale, title, search, related, manual, hot }) => {
			const counts = {
				appeared: 12,
				newTracking: 5,
				existing: 2,
				rejected: 1,
				skipped: 0,
				deferred: 0,
				failure: 4,
				cancelled: 0,
				timeout: 0,
			};
			const html = render(locale, () => (
				<DiscoveryStatsTable
					byChannel={{
						search: counts,
						related: counts,
						manual: counts,
						hot_sample: counts,
					}}
				/>
			));
			for (const label of [title, search, related, manual, hot])
				expect(html).toContain(label);
			expect(html).not.toContain("metrics.");
		}
	);

	test.each([
		{ locale: "en-US", type: "Incremental", target: "2 keywords" },
		{ locale: "zh-CN", type: "增量搜索", target: "2 个关键词" },
	])(
		"renders old task descriptions in $locale and shows why they failed",
		({ locale, type, target }) => {
			const job: DiscoveryActivity = {
				id: "failed-sweep",
				name: "repeatable-search-sweep",
				state: "failed",
				task: {
					type: "search-sweep",
					mode: "incremental",
					config: { keywords: ["keyword A", "keyword B"] },
				},
				target: "2 个关键词 (keyword A 等)",
				timestamp: 1_000,
				processedOn: 1_100,
				finishedOn: 1_200,
				failedReason: "Upstream connection timed out",
				progress: null,
			};
			const html = render(locale, () => (
				<DiscoveryActivityView
					error={null}
					status={{
						active: false,
						counts: { active: 0, waiting: 0, delayed: 0, failed: 1, oldestWaitSec: 0 },
						activeJobs: [],
						recentJobs: [job],
						candidatesPerMin: 0,
					}}
				/>
			));
			for (const label of [type, target, "Upstream connection timed out", "&lt;1s"])
				expect(html).toContain(label);
			expect(html).not.toContain("keyword A 等");
			expect(html).not.toContain("discoveryActivity.");
			expect(html).not.toContain("Execution trace");
		}
	);
});
