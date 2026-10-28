import { createSignal, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Tabs, { type TabItem } from "@components/ui/Tabs";
import { ToastContainer } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { CrawlerStatusDto } from "@cvsa/contracts";
import LayoutDashboard from "lucide-solid/icons/layout-dashboard";
import ListTodo from "lucide-solid/icons/list-todo";
import Video from "lucide-solid/icons/video";
import Compass from "lucide-solid/icons/compass";
import Network from "lucide-solid/icons/network";
import Settings from "lucide-solid/icons/settings";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Plus from "lucide-solid/icons/plus";
import ManualIngestModal from "./crawler/ManualIngestModal";
import OverviewSection from "./crawler/sections/OverviewSection";
import TasksSection from "./crawler/sections/TasksSection";
import VideosSection from "./crawler/sections/VideosSection";
import DiscoverySection from "./crawler/sections/DiscoverySection";
import NetworkSection from "./crawler/sections/NetworkSection";
import SettingsSection from "./crawler/sections/SettingsSection";

type SectionId = "overview" | "tasks" | "videos" | "discovery" | "network" | "settings";

export default function CrawlerDashboard() {
	const t = getComponentT("crawler");
	const [activeSection, setActiveSection] = createSignal<SectionId>("overview");
	const [statusData, setStatusData] = createSignal<CrawlerStatusDto | null>(null);
	const [loadingStatus, setLoadingStatus] = createSignal(false);
	const [manualIngestOpen, setManualIngestOpen] = createSignal(false);

	const refreshStatus = async () => {
		setLoadingStatus(true);
		const res = await api.crawler.getStatus();
		setLoadingStatus(false);
		if (res.ok && res.data) {
			setStatusData(res.data);
			return;
		}
	};

	onMount(() => {
		void refreshStatus();
	});

	const tabs = (): TabItem<SectionId>[] => [
		{ id: "overview", label: t("tabs.overview"), icon: LayoutDashboard },
		{ id: "discovery", label: t("tabs.discovery"), icon: Compass },
		{ id: "network", label: t("tabs.network"), icon: Network },
		{ id: "videos", label: t("tabs.videos"), icon: Video },
		{ id: "tasks", label: t("tabs.tasks"), icon: ListTodo },
		{ id: "settings", label: t("tabs.settings"), icon: Settings },
	];

	const healthyAdaptersCount = () =>
		statusData()?.adapters.filter((a) => a.healthState.toLowerCase() === "healthy").length ?? 0;
	const totalAdaptersCount = () => statusData()?.adapters.length ?? 0;

	return (
		<div class="flex flex-col gap-6">
			<ToastContainer />

			{/* Page Header */}
			<header class="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-3">
						<h1 class="ts-heading-1 text-primary">{t("title")}</h1>
						<Show when={statusData()}>
							{(status) => (
								<Badge
									variant={status().ready ? "success" : "warning"}
									dot
									size="md"
								>
									{status().ready ? "就绪" : "启动中"}
								</Badge>
							)}
						</Show>
					</div>
					<p class="ts-caption text-tertiary">{t("subtitle")}</p>
				</div>

				<div class="flex items-center gap-3">
					<Show when={statusData()}>
						<div class="hidden sm:flex items-center gap-2 ts-caption text-secondary bg-surface-container-high px-3 py-1.5 border border-border">
							<span class="text-tertiary">适配器:</span>
							<span class="font-medium text-primary">
								{healthyAdaptersCount()} / {totalAdaptersCount()} 在线
							</span>
						</div>
					</Show>

					<Button
						variant="filled"
						size="sm"
						onClick={() => setManualIngestOpen(true)}
						class="gap-1.5"
					>
						<Plus class="w-3.5 h-3.5" />
						<span>手动收录</span>
					</Button>

					<Button
						variant="outlined"
						size="sm"
						disabled={loadingStatus()}
						onClick={() => void refreshStatus()}
						class="gap-1.5"
					>
						<RefreshCw
							class={"w-3.5 h-3.5 " + (loadingStatus() ? "animate-spin" : "")}
						/>
						<span>
							{loadingStatus() ? t("common.refreshing") : t("common.refresh")}
						</span>
					</Button>
				</div>
			</header>

			{/* Navigation Tabs */}
			<nav aria-label="Dashboard Navigation">
				<Tabs
					items={tabs()}
					value={activeSection()}
					onChange={(id) => setActiveSection(id)}
					size="md"
				/>
			</nav>

			{/* Tab Sections */}
			<main class="min-w-0">
				<div classList={{ hidden: activeSection() !== "overview" }}>
					<OverviewSection
						statusData={statusData}
						loadingStatus={loadingStatus}
						refreshStatus={refreshStatus}
					/>
				</div>
				<div classList={{ hidden: activeSection() !== "discovery" }}>
					<DiscoverySection />
				</div>
				<div classList={{ hidden: activeSection() !== "network" }}>
					<NetworkSection
						statusData={statusData}
						loadingStatus={loadingStatus}
						refreshStatus={refreshStatus}
					/>
				</div>
				<div classList={{ hidden: activeSection() !== "videos" }}>
					<VideosSection />
				</div>
				<div classList={{ hidden: activeSection() !== "tasks" }}>
					<TasksSection />
				</div>
				<div classList={{ hidden: activeSection() !== "settings" }}>
					<SettingsSection />
				</div>
			</main>

			<ManualIngestModal
				isOpen={manualIngestOpen()}
				onClose={() => setManualIngestOpen(false)}
				onSuccess={() => void refreshStatus()}
			/>
		</div>
	);
}
