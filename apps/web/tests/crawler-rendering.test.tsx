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
		{ locale: "en-US", type: "Incremental Sweep", target: "2 keywords" },
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
