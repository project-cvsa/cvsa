import { createSignal, onCleanup, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge, { type BadgeVariant } from "@components/ui/Badge";
import Tabs, { type TabItem } from "@components/ui/Tabs";
import { ToastContainer } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { CrawlerStatusDto } from "@cvsa/contracts";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Plus from "lucide-solid/icons/plus";
import ManualIngestModal from "./crawler/ManualIngestModal";
import LabelingSection from "./crawler/sections/LabelingSection";
import { CrawlerRefreshProvider, type CrawlerSection } from "./crawler/refresh";
import OverviewSection from "./crawler/sections/OverviewSection";
import TasksSection from "./crawler/sections/TasksSection";
import VideosSection from "./crawler/sections/VideosSection";
import DiscoverySection from "./crawler/sections/DiscoverySection";
import NetworkSection from "./crawler/sections/NetworkSection";
import SettingsSection from "./crawler/sections/SettingsSection";
import { createRequestSequence } from "./crawler/videoActions";

type SectionId = CrawlerSection;

export default function CrawlerDashboard() {
	const t = getComponentT("crawler");
	const [activeSection, setActiveSection] = createSignal<SectionId>("overview");
	const [visited, setVisited] = createSignal<ReadonlySet<SectionId>>(new Set(["overview"]));
	const [refreshRevision, setRefreshRevision] = createSignal(0);
	const [refreshingManual, setRefreshingManual] = createSignal(false);
	const refreshAll = () => {
		setRefreshingManual(true);
		setRefreshRevision((value) => value + 1);
		void refreshStatus().finally(() => setRefreshingManual(false));
	};
	const statusRequests = createRequestSequence();
	const [statusData, setStatusData] = createSignal<CrawlerStatusDto | null>(null);
	const [loadingStatus, setLoadingStatus] = createSignal(false);
	const [statusError, setStatusError] = createSignal<string | null>(null);
	const [manualIngestOpen, setManualIngestOpen] = createSignal(false);

	const refreshStatus = async () => {
		if (loadingStatus()) return;
		const request = statusRequests.start();
		setLoadingStatus(true);
		const res = await api.crawler.getStatus();
		if (!statusRequests.isCurrent(request)) return;
		setLoadingStatus(false);
		if (res.ok && res.data) {
			setStatusData(res.data);
			setStatusError(null);
			return;
		}
		setStatusData(null);
		setStatusError(
			res.ok ? t("dashboard.statusFailed") : res.error.message || t("dashboard.statusFailed")
		);
	};

	onMount(() => {
		const section = new URLSearchParams(window.location.search).get("section");
		if (
			section === "videos" ||
			section === "tasks" ||
			section === "discovery" ||
			section === "labeling" ||
			section === "network" ||
			section === "settings"
		) {
			setActiveSection(section);
			setVisited(new Set(["overview", section]));
		}
		void refreshStatus();
		const timer = setInterval(() => {
			if (!document.hidden) void refreshStatus();
		}, 10000);
		const onVisible = () => {
			if (!document.hidden) void refreshStatus();
		};
		document.addEventListener("visibilitychange", onVisible);
		onCleanup(() => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		});
	});

	const tabs = (): TabItem<SectionId>[] => [
		{ id: "overview", label: t("tabs.overview") },
		{ id: "discovery", label: t("tabs.discovery") },
		{ id: "labeling", label: t("tabs.labeling") },
		{ id: "network", label: t("tabs.network") },
		{ id: "videos", label: t("tabs.videos") },
		{ id: "tasks", label: t("tabs.tasks") },
		{ id: "settings", label: t("tabs.settings") },
	];

	const statusBadgeVariant = (): BadgeVariant => (statusData()?.ready ? "success" : "warning");
	const statusBadgeLabel = () =>
		statusData()?.ready ? t("dashboard.ready") : t("dashboard.starting");

	return (
		<div class="crawler-panel flex flex-col gap-6">
			<ToastContainer />

			{/* Page Header */}
			<header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-3">
						<h1 class="ts-heading-1 text-primary">{t("title")}</h1>
						<Show when={statusData()}>
							<Badge variant={statusBadgeVariant()} dot size="md">
								{statusBadgeLabel()}
							</Badge>
						</Show>
					</div>
				</div>

				<div class="flex items-center gap-3">
					<Button
						variant="filled"
						size="sm"
						onClick={() => setManualIngestOpen(true)}
						class="gap-1.5"
					>
						<Plus class="w-3.5 h-3.5" />
						<span>{t("dashboard.ingest")}</span>
					</Button>

					<Button
						variant="outlined"
						size="sm"
						loading={refreshingManual()}
						onClick={refreshAll}
						class="gap-1.5"
					>
						<RefreshCw class="w-3.5 h-3.5" />
						<span>{t("common.refresh")}</span>
					</Button>
				</div>
			</header>

			<Show when={statusError()}>
				{(error) => (
					<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
						{error()}
					</div>
				)}
			</Show>

			{/* Navigation Tabs */}
			<nav aria-label={t("dashboard.navigation")}>
				<Tabs
					items={tabs()}
					value={activeSection()}
					onChange={(id) => {
						setActiveSection(id);
						setVisited((current) => new Set([...current, id]));
					}}
					size="md"
				/>
			</nav>

			{/* Tab Sections */}
			<CrawlerRefreshProvider section={activeSection} revision={refreshRevision}>
				<main class="min-w-0">
					<div classList={{ hidden: activeSection() !== "overview" }}>
						<OverviewSection statusData={statusData} />
					</div>
					<Show when={visited().has("discovery")}>
						<div classList={{ hidden: activeSection() !== "discovery" }}>
							<DiscoverySection />
						</div>
					</Show>
					<Show when={visited().has("labeling")}>
						<div classList={{ hidden: activeSection() !== "labeling" }}>
							<LabelingSection active={activeSection() === "labeling"} />
						</div>
					</Show>
					<Show when={visited().has("network")}>
						<div classList={{ hidden: activeSection() !== "network" }}>
							<NetworkSection statusData={statusData} refreshStatus={refreshStatus} />
						</div>
					</Show>
					<Show when={visited().has("videos")}>
						<div classList={{ hidden: activeSection() !== "videos" }}>
							<VideosSection />
						</div>
					</Show>
					<Show when={visited().has("tasks")}>
						<div classList={{ hidden: activeSection() !== "tasks" }}>
							<TasksSection />
						</div>
					</Show>
					<Show when={visited().has("settings")}>
						<div classList={{ hidden: activeSection() !== "settings" }}>
							<SettingsSection />
						</div>
					</Show>
				</main>
			</CrawlerRefreshProvider>

			<ManualIngestModal
				isOpen={manualIngestOpen()}
				onClose={() => setManualIngestOpen(false)}
				onSuccess={refreshAll}
			/>
		</div>
	);
}
