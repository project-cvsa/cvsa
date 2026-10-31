import { createSignal, onMount, Show } from "solid-js";
import { toast } from "@components/ui/Toast";
import { cn } from "@lib/cn";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	BilibiliVideoMetadataDto,
	VideoMetadataHistoryListResponse,
	VideoSnapshotListResponse,
	VideoTrackingDto,
} from "@cvsa/contracts";
import VideoDetailHero from "./VideoDetailHero";
import VideoSchedulerCard from "./VideoSchedulerCard";
import VideoSnapshotHistory from "./VideoSnapshotHistory";
import VideoMetadataTab from "./VideoMetadataTab";
import VideoDiscoveryTab from "./VideoDiscoveryTab";
import VideoHistory from "./VideoHistory";
import PromoteMilestoneModal from "./PromoteMilestoneModal";

const HISTORY_PAGE_SIZE = 10;
const SNAPSHOTS_PAGE_SIZE = 10;

type DetailTabId = "snapshots" | "metadata" | "discovery" | "history";

export default function VideoDetailPage(props: { aid: string }) {
	const t = getComponentT("crawler");
	const [activeTab, setActiveTab] = createSignal<DetailTabId>("snapshots");
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<string | null>(null);
	const [metadata, setMetadata] = createSignal<BilibiliVideoMetadataDto | null>(null);
	const [tracking, setTracking] = createSignal<VideoTrackingDto | null>(null);
	const [history, setHistory] = createSignal<VideoMetadataHistoryListResponse | null>(null);
	const [historyOffset, setHistoryOffset] = createSignal(0);
	const [loadingHistory, setLoadingHistory] = createSignal(false);
	const [historyError, setHistoryError] = createSignal<string | null>(null);
	const [snapshots, setSnapshots] = createSignal<VideoSnapshotListResponse | null>(null);
	const [snapshotsOffset, setSnapshotsOffset] = createSignal(0);
	const [loadingSnapshots, setLoadingSnapshots] = createSignal(false);
	const [snapshotsError, setSnapshotsError] = createSignal<string | null>(null);
	const [pendingAction, setPendingAction] = createSignal<string | null>(null);
	const [showPromoteModal, setShowPromoteModal] = createSignal(false);

	const loadDetail = async (targetAid: string) => {
		setLoading(true);
		setError(null);
		const [metaRes, trackRes] = await Promise.all([
			api.crawler.getMetadata(targetAid),
			api.crawler.getTracking(targetAid),
		]);
		setLoading(false);

		if (metaRes.ok) setMetadata(metaRes.data ?? null);
		else if (metaRes.status === 404) setMetadata(null);
		if (trackRes.ok) setTracking(trackRes.data ?? null);
		else if (trackRes.status === 404) setTracking(null);

		if (!metaRes.ok && !trackRes.ok) {
			setError(metaRes.error.message || trackRes.error.message || t("common.error"));
		}

		void loadHistory(targetAid, 0);
		void loadSnapshots(targetAid, 0);
	};

	const loadSnapshots = async (targetAid: string, offset: number) => {
		setLoadingSnapshots(true);
		setSnapshotsError(null);
		const res = await api.crawler.getVideoSnapshots(targetAid, {
			limit: SNAPSHOTS_PAGE_SIZE,
			offset,
		});
		setLoadingSnapshots(false);
		if (res.ok && res.data) {
			setSnapshots(res.data);
			setSnapshotsOffset(offset);
			return;
		}
		setSnapshotsError(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const loadHistory = async (targetAid: string, offset: number) => {
		setLoadingHistory(true);
		setHistoryError(null);
		const res = await api.crawler.getMetadataHistory(targetAid, {
			limit: HISTORY_PAGE_SIZE,
			offset,
		});
		setLoadingHistory(false);
		if (res.ok && res.data) {
			setHistory(res.data);
			setHistoryOffset(offset);
			return;
		}
		setHistoryError(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const runAction = async (type: "snapshot" | "metadata") => {
		if (pendingAction()) return;
		setPendingAction(type);
		const res =
			type === "snapshot"
				? await api.crawler.queueSnapshot(props.aid)
				: await api.crawler.refreshMetadata(props.aid);
		setPendingAction(null);
		if (res.ok) {
			toast.success(t("videoDetail.actionQueued"));
			void loadDetail(props.aid);
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	const runUntrack = async () => {
		if (pendingAction()) return;
		setPendingAction("untrack");
		const res = await api.crawler.deleteTracking(props.aid);
		setPendingAction(null);
		if (res.ok) {
			setTracking(null);
			toast.success(t("audit.untracked"), {
				duration: 8000,
				action: {
					label: t("common.undo"),
					onClick: async () => {
						const sampleRes = await api.crawler.labelDiscoverySample(props.aid, 1);
						const restoreSuccess =
							sampleRes.ok ||
							(
								await api.crawler.registerTracking({
									aids: [props.aid],
									state: "regular",
								})
							).ok;
						if (restoreSuccess) {
							void loadDetail(props.aid);
							toast.success(t("videos.undoSuccess"));
						} else {
							toast.error(sampleRes.error?.message || t("common.error"));
						}
					},
				},
			});
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	onMount(() => {
		void loadDetail(props.aid);
	});

	const historyTotal = () => history()?.total ?? 0;
	const historyPage = () => Math.floor(historyOffset() / HISTORY_PAGE_SIZE);
	const snapshotsTotal = () => snapshots()?.total ?? 0;
	const snapshotsPage = () => Math.floor(snapshotsOffset() / SNAPSHOTS_PAGE_SIZE);

	return (
		<div class="crawler-panel flex flex-col gap-6">
			{/* Top Hero Section */}
			<VideoDetailHero
				aid={props.aid}
				metadata={metadata}
				tracking={tracking}
				loading={loading}
				pendingAction={pendingAction}
				onAction={(act) => void runAction(act)}
				onRefresh={() => void loadDetail(props.aid)}
				onPromote={() => setShowPromoteModal(true)}
				onUntrack={() => void runUntrack()}
			/>

			{/* Error Banner */}
			<Show when={error()}>
				{(msg) => (
					<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
						{msg()}
					</div>
				)}
			</Show>

			{/* Tabs Navigation (Direct left-aligned navigation bar) */}
			<nav class="w-full flex items-center justify-start gap-8 border-b border-border">
				<button
					type="button"
					onClick={() => setActiveTab("snapshots")}
					class={cn(
						"pb-3 ts-label font-semibold border-b-2 -mb-[1px] transition-colors cursor-pointer flex items-center gap-1.5",
						activeTab() === "snapshots"
							? "border-primary text-primary"
							: "border-transparent text-secondary hover:text-primary"
					)}
				>
					<span>{t("videoDetail.tabs.snapshots")}</span>
					<Show when={snapshotsTotal() > 0}>
						<span class="px-1.5 py-0.5 bg-surface-container-high text-secondary ts-caption font-normal">
							{snapshotsTotal()}
						</span>
					</Show>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("metadata")}
					class={cn(
						"pb-3 ts-label font-semibold border-b-2 -mb-[1px] transition-colors cursor-pointer flex items-center gap-1.5",
						activeTab() === "metadata"
							? "border-primary text-primary"
							: "border-transparent text-secondary hover:text-primary"
					)}
				>
					<span>{t("videoDetail.tabs.metadata")}</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("discovery")}
					class={cn(
						"pb-3 ts-label font-semibold border-b-2 -mb-[1px] transition-colors cursor-pointer flex items-center gap-1.5",
						activeTab() === "discovery"
							? "border-primary text-primary"
							: "border-transparent text-secondary hover:text-primary"
					)}
				>
					<span>{t("videoDetail.tabs.discovery")}</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("history")}
					class={cn(
						"pb-3 ts-label font-semibold border-b-2 -mb-[1px] transition-colors cursor-pointer flex items-center gap-1.5",
						activeTab() === "history"
							? "border-primary text-primary"
							: "border-transparent text-secondary hover:text-primary"
					)}
				>
					<span>{t("videoDetail.tabs.history")}</span>
					<Show when={historyTotal() > 0}>
						<span class="px-1.5 py-0.5 bg-surface-container-high text-secondary ts-caption font-normal">
							{historyTotal()}
						</span>
					</Show>
				</button>
			</nav>

			{/* Tab 1: Snapshots & Scheduler */}
			<Show when={activeTab() === "snapshots"}>
				<div class="flex flex-col gap-6">
					<Show when={tracking()}>
						{(track) => <VideoSchedulerCard data={track()} />}
					</Show>

					<VideoSnapshotHistory
						snapshots={snapshots}
						snapshotsTotal={snapshotsTotal}
						snapshotsPage={snapshotsPage}
						snapshotsError={snapshotsError}
						loadingSnapshots={loadingSnapshots}
						loadSnapshotsPage={(offset) => loadSnapshots(props.aid, offset)}
						pageSize={SNAPSHOTS_PAGE_SIZE}
					/>
				</div>
			</Show>

			{/* Tab 2: Full Metadata & Staff */}
			<Show when={activeTab() === "metadata"}>
				<Show
					when={metadata()}
					fallback={
						<div class="py-12 text-center text-tertiary ts-caption">
							{loading() ? t("common.loading") : t("common.unknown")}
						</div>
					}
				>
					{(meta) => <VideoMetadataTab data={meta()} />}
				</Show>
			</Show>

			{/* Tab 3: Discovery Origin & Recommendation Relations */}
			<Show when={activeTab() === "discovery"}>
				<Show
					when={metadata()}
					fallback={
						<div class="py-12 text-center text-tertiary ts-caption">
							{loading() ? t("common.loading") : t("common.unknown")}
						</div>
					}
				>
					{(meta) => <VideoDiscoveryTab aid={props.aid} metadata={meta()} />}
				</Show>
			</Show>

			{/* Tab 4: Metadata Change History */}
			<Show when={activeTab() === "history"}>
				<VideoHistory
					history={history}
					historyTotal={historyTotal}
					historyPage={historyPage}
					historyError={historyError}
					loadingHistory={loadingHistory}
					loadHistoryPage={(offset) => loadHistory(props.aid, offset)}
					pageSize={HISTORY_PAGE_SIZE}
				/>
			</Show>

			{/* Promote Milestone Modal */}
			<PromoteMilestoneModal
				isOpen={showPromoteModal()}
				onClose={() => setShowPromoteModal(false)}
				aid={props.aid}
				currentMilestone={tracking()?.targetMilestone}
				onSuccess={() => void loadDetail(props.aid)}
			/>
		</div>
	);
}
