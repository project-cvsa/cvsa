import { createSignal, Show } from "solid-js";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { useCrawlerRefresh } from "./refresh";

type ChannelCounts = CrawlerOverviewStats["discovery"]["byChannel"][string];
type ChannelRow = ChannelCounts & { channel: string };

export function DiscoveryStatsTable(props: {
	byChannel: CrawlerOverviewStats["discovery"]["byChannel"];
}) {
	const t = getComponentT("crawler:metrics");
	const rows = (): ChannelRow[] =>
		Object.entries(props.byChannel).map(([channel, counts]) => ({ channel, ...counts }));
	const columns: TableColumn<ChannelRow>[] = [
		{
			id: "channel",
			header: t("metrics.channel"),
			cell: (row) => t(`metrics.channel.${row.channel}`),
		},
		{
			id: "appeared",
			header: t("metrics.appeared"),
			class: "text-right",
			cell: (row) => row.appeared,
		},
		{
			id: "newTracking",
			header: t("metrics.newTracking"),
			class: "text-right",
			cell: (row) => row.newTracking,
		},
		{
			id: "existing",
			header: t("metrics.existing"),
			class: "text-right",
			cell: (row) => row.existing,
		},
		{
			id: "rejected",
			header: t("metrics.rejected"),
			class: "text-right",
			cell: (row) => row.rejected,
		},
		{
			id: "skipped",
			header: t("metrics.skipped"),
			class: "text-right",
			cell: (row) => row.skipped,
		},
		{
			id: "deferred",
			header: t("metrics.deferred"),
			class: "text-right",
			cell: (row) => row.deferred,
		},
		{
			id: "failure",
			header: t("metrics.failed"),
			class: "text-right",
			cell: (row) => row.failure,
		},
	];

	return (
		<section class="flex flex-col gap-3">
			<h3 class="ts-label text-primary">{t("metrics.discovery")}</h3>
			<DataTable columns={columns} items={rows()} empty={t("common.none")} />
		</section>
	);
}

export default function DiscoveryStats() {
	const t = getComponentT("crawler");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(true);
	const load = async () => {
		const res = await api.crawler.getStats("24h");
		setLoading(false);
		if (res.ok) {
			setStats(res.data);
			setError(null);
		} else setError(res.error.message || t("common.error"));
	};
	useCrawlerRefresh("discovery", () => void load());
	return (
		<div class="flex flex-col gap-3">
			<Show when={error()}>
				{(message) => (
					<p role="alert" class="ts-body text-error">
						{message()}
					</p>
				)}
			</Show>
			<Show
				when={!loading()}
				fallback={<p class="ts-caption text-tertiary">{t("common.loading")}</p>}
			>
				<DiscoveryStatsTable byChannel={stats()?.discovery.byChannel ?? {}} />
			</Show>
		</div>
	);
}
