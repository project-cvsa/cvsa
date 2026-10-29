import { createSignal } from "solid-js";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoveryStatusDto } from "@cvsa/contracts";
import SectionHeader from "../SectionHeader";
import DiscoveryActivity from "../discovery/DiscoveryActivity";
import DiscoveryActions from "../discovery/DiscoveryActions";
import GraphExplorer from "../discovery/GraphExplorer";
import { useCrawlerRefresh } from "../refresh";

export default function DiscoverySection() {
	const t = getComponentT("crawler");
	const [status, setStatus] = createSignal<DiscoveryStatusDto | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	let loading = false;
	const loadStatus = async () => {
		if (loading) return;
		loading = true;
		const result = await api.crawler.getDiscoveryStatus();
		loading = false;
		if (result.ok && result.data) {
			setStatus(result.data);
			setError(null);
		} else setError(result.ok ? t("common.error") : result.error.message || t("common.error"));
	};
	useCrawlerRefresh("discovery", () => void loadStatus());
	return (
		<div class="flex flex-col gap-6">
			<SectionHeader title={<h2 class="ts-heading-2">{t("tabs.discovery")}</h2>} />
			<DiscoveryActivity status={status()} error={error()} />
			<DiscoveryActions onQueued={() => void loadStatus()} />
			<GraphExplorer onIngestSuccess={() => void loadStatus()} />
		</div>
	);
}
