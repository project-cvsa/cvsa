import { createSignal } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { useCrawlerRefresh } from "./refresh";
import { MetricCard } from "./statsView";
import { formatPercent } from "./format";

export default function LabelingStats() {
	const t = getComponentT("crawler:metrics");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const load = async () => {
		const res = await api.crawler.getStats("24h");
		if (res.ok && res.data) setStats(res.data);
	};
	useCrawlerRefresh("labeling", () => void load());
	const labeling = () => stats()?.labeling;

	return (
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
			<MetricCard label={t("metrics.samples")} value={String(labeling()?.samples ?? 0)} />
			<MetricCard
				label={t("metrics.accuracy")}
				value={
					labeling()?.accuracy == null ? "—" : formatPercent(labeling()?.accuracy ?? 0)
				}
			/>
			<MetricCard
				label={t("metrics.precision")}
				value={
					labeling()?.precision == null ? "—" : formatPercent(labeling()?.precision ?? 0)
				}
			/>
			<MetricCard
				label={t("metrics.recall")}
				value={labeling()?.recall == null ? "—" : formatPercent(labeling()?.recall ?? 0)}
			/>
		</div>
	);
}
