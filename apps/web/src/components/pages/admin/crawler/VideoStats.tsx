import { createSignal } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { useCrawlerRefresh } from "./refresh";
import { MetricCard } from "./statsView";

export default function VideoStats() {
	const t = getComponentT("crawler:metrics");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const load = async () => {
		const res = await api.crawler.getStats("24h");
		if (res.ok && res.data) setStats(res.data);
	};
	useCrawlerRefresh("videos", () => void load());

	return (
		<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
			<MetricCard
				label={t("metrics.videoCoverage")}
				value={stats()?.videoCoverage == null ? "—" : String(stats()?.videoCoverage)}
			/>
			<MetricCard
				label={t("metrics.neverCaptured")}
				value={String(stats()?.current.tracking.neverCaptured ?? 0)}
			/>
			<MetricCard
				label={t("metrics.dueNow")}
				value={String(stats()?.current.tracking.dueNow ?? 0)}
			/>
		</div>
	);
}
