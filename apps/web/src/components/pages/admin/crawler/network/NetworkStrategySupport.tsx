import { createSignal, Show } from "solid-js";
import type { CrawlerStrategyStatus } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { useCrawlerRefresh } from "../refresh";
import { formatMetric } from "../format";

export default function NetworkStrategySupport() {
	const t = getComponentT("crawler");
	const [strategies, setStrategies] = createSignal<CrawlerStrategyStatus[]>([]);
	const load = async () => {
		const res = await api.crawler.getStats("5m");
		if (res.ok && res.data) setStrategies(res.data.current.strategies);
	};
	useCrawlerRefresh("network", () => void load());

	const columns: TableColumn<CrawlerStrategyStatus>[] = [
		{
			id: "strategy",
			header: t("metrics.strategy"),
			cell: (row) => t(`metrics.strategy.${row.key}`),
		},
		{
			id: "support",
			header: t("metrics.support"),
			cell: (row) => (
				<Badge
					size="sm"
					variant={
						row.support === "active"
							? "success"
							: row.support === "configured_not_wired"
								? "warning"
								: "neutral"
					}
				>
					{t(`metrics.support.${row.support}`)}
				</Badge>
			),
		},
		{
			id: "configured",
			header: t("metrics.configured"),
			cell: (row) => (row.configured ? t("common.yes") : t("common.no")),
		},
		{
			id: "value",
			header: t("metrics.effectiveValue"),
			cell: (row) =>
				row.healthFactor !== null
					? formatMetric(row.healthFactor)
					: row.adaptiveFactor !== null
						? formatMetric(row.adaptiveFactor)
						: row.reservedShare !== null
							? formatMetric(row.reservedShare)
							: "—",
		},
	];

	return (
		<section class="flex flex-col gap-3">
			<Show when={strategies().length > 0}>
				<h3 class="ts-label text-primary">{t("metrics.strategies")}</h3>
				<DataTable columns={columns} items={strategies()} />
				<p class="ts-caption text-secondary">{t("metrics.strategiesHelp")}</p>
			</Show>
		</section>
	);
}
