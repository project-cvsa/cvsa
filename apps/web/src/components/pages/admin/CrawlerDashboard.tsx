import { createSignal, For, onMount } from "solid-js";
import Button from "@components/ui/Button";
import { ToastContainer, toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type { CrawlerStatusDto } from "@cvsa/contracts";
import OverviewSection from "./crawler/sections/OverviewSection";
import TasksSection from "./crawler/sections/TasksSection";
import VideosSection from "./crawler/sections/VideosSection";
import DiscoverySection from "./crawler/sections/DiscoverySection";
import NetworkSection from "./crawler/sections/NetworkSection";
import SettingsSection from "./crawler/sections/SettingsSection";

type SectionId = "overview" | "tasks" | "videos" | "discovery" | "network" | "settings";

const sections: { id: SectionId; label: string }[] = [
	{ id: "overview", label: "Overview" },
	{ id: "tasks", label: "Tasks" },
	{ id: "videos", label: "Videos" },
	{ id: "discovery", label: "Discovery" },
	{ id: "network", label: "Network" },
	{ id: "settings", label: "Settings" },
];

export default function CrawlerDashboard() {
	const [activeSection, setActiveSection] = createSignal<SectionId>("overview");
	const [statusData, setStatusData] = createSignal<CrawlerStatusDto | null>(null);
	const [loadingStatus, setLoadingStatus] = createSignal(false);

	const refreshStatus = async () => {
		setLoadingStatus(true);
		const res = await api.crawler.getStatus();
		setLoadingStatus(false);
		if (res.ok && res.data) {
			setStatusData(res.data);
			return;
		}
		toast.error(res.ok ? "No status data" : res.error.message || "Status unavailable");
	};

	onMount(() => {
		void refreshStatus();
	});

	return (
		<div class="flex flex-col gap-6">
			<ToastContainer />
			<header class="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
				<h1 class="ts-heading-1 text-primary">Crawler</h1>
				<nav class="flex flex-wrap gap-2" aria-label="Crawler sections">
					<For each={sections}>
						{(section) => (
							<Button
								variant={activeSection() === section.id ? "filled" : "outlined"}
								size="sm"
								aria-pressed={activeSection() === section.id}
								onClick={() => setActiveSection(section.id)}
							>
								{section.label}
							</Button>
						)}
					</For>
				</nav>
			</header>

			<div classList={{ hidden: activeSection() !== "overview" }}>
				<OverviewSection
					statusData={statusData}
					loadingStatus={loadingStatus}
					refreshStatus={refreshStatus}
				/>
			</div>
			<div classList={{ hidden: activeSection() !== "tasks" }}>
				<TasksSection />
			</div>
			<div classList={{ hidden: activeSection() !== "videos" }}>
				<VideosSection />
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
			<div classList={{ hidden: activeSection() !== "settings" }}>
				<SettingsSection />
			</div>
		</div>
	);
}
