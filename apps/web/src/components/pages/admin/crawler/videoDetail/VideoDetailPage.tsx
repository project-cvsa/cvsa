import { createSignal, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge, { type BadgeVariant } from "@components/ui/Badge";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	BilibiliVideoMetadataDto,
	VideoMetadataHistoryListResponse,
	VideoTrackingDto,
} from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";
import VideoHistory from "./VideoHistory";
import ExternalLink from "lucide-solid/icons/external-link";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Camera from "lucide-solid/icons/camera";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Trash2 from "lucide-solid/icons/trash-2";

const HISTORY_PAGE_SIZE = 10;

export default function VideoDetailPage(props: { aid: string }) {
	const t = getComponentT("crawler");
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<string | null>(null);
	const [metadata, setMetadata] = createSignal<BilibiliVideoMetadataDto | null>(null);
	const [tracking, setTracking] = createSignal<VideoTrackingDto | null>(null);
	const [history, setHistory] = createSignal<VideoMetadataHistoryListResponse | null>(null);
	const [historyOffset, setHistoryOffset] = createSignal(0);
	const [loadingHistory, setLoadingHistory] = createSignal(false);
	const [historyError, setHistoryError] = createSignal<string | null>(null);
	const [pendingAction, setPendingAction] = createSignal<string | null>(null);

	const loadDetail = async (targetAid: string) => {
		setLoading(true);
		setError(null);
		const [metaRes, trackRes] = await Promise.all([
			api.crawler.getMetadata(targetAid),
			api.crawler.getTracking(targetAid),
		]);
		setLoading(false);

		if (metaRes.ok && metaRes.data) setMetadata(metaRes.data);
		if (trackRes.ok && trackRes.data) setTracking(trackRes.data);

		if (!metaRes.ok && !trackRes.ok) {
			setError(metaRes.error.message || trackRes.error.message || t("common.error"));
		}

		void loadHistory(targetAid, 0);
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
				: await api.crawler.fetchDetail(props.aid);
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
			toast.success("已将该视频移出追踪队列");
			setTracking(null);
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	onMount(() => {
		void loadDetail(props.aid);
	});

	const statePresentation = (state: string): { label: string; variant: BadgeVariant } => {
		switch (state) {
			case "new":
				return { label: t("videos.state.new"), variant: "info" };
			case "regular":
				return { label: t("videos.state.regular"), variant: "neutral" };
			case "milestone":
				return { label: t("videos.state.milestone"), variant: "warning" };
			case "archive":
				return { label: t("videos.state.archive"), variant: "default" };
			default:
				return { label: state, variant: "neutral" };
		}
	};

	const historyTotal = () => history()?.total ?? 0;
	const historyPage = () => Math.floor(historyOffset() / HISTORY_PAGE_SIZE);

	return (
		<div class="flex flex-col gap-6">
			{/* Breadcrumb Navigation & Action Toolbar */}
			<div class="flex flex-col gap-3">
				<div>
					<a
						href="/admin/crawler"
						class="text-xs text-secondary hover:text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer"
					>
						<ArrowLeft class="w-3.5 h-3.5" />
						<span>{t("common.back")}</span>
					</a>
				</div>

				<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div class="flex items-center gap-3 flex-wrap">
						<h1 class="ts-heading-2 text-primary font-semibold">AID {props.aid}</h1>
						<Show when={metadata()?.bvid}>
							{(bvid) => (
								<a
									href={`https://www.bilibili.com/video/${bvid()}`}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
								>
									<span>{bvid()}</span>
									<ExternalLink class="w-3.5 h-3.5 text-tertiary" />
								</a>
							)}
						</Show>
						<Show when={tracking()?.state}>
							{(st) => (
								<Badge variant={statePresentation(st()).variant} size="md">
									{statePresentation(st()).label}
								</Badge>
							)}
						</Show>
					</div>

					<div class="flex items-center gap-2">
						<Button
							size="md"
							variant="outlined"
							loading={pendingAction() === "snapshot"}
							onClick={() => void runAction("snapshot")}
							class="gap-1.5"
						>
							<Camera class="w-4 h-4" />
							<span>{t("videoDetail.queueSnapshot")}</span>
						</Button>
						<Button
							size="md"
							variant="outlined"
							loading={pendingAction() === "metadata"}
							onClick={() => void runAction("metadata")}
							class="gap-1.5"
						>
							<RefreshCw class="w-4 h-4" />
							<span>{t("videoDetail.queueMetadata")}</span>
						</Button>
						<Button
							size="md"
							variant="outlined"
							loading={loading()}
							onClick={() => void loadDetail(props.aid)}
							class="gap-1.5"
						>
							<RefreshCw class="w-4 h-4" />
							<span>{t("common.refresh")}</span>
						</Button>
						<Show when={tracking()}>
							<Button
								size="md"
								variant="outlined"
								loading={pendingAction() === "untrack"}
								onClick={() => void runUntrack()}
								class="gap-1.5 border-error/40 text-error hover:bg-error/10 hover:border-error"
							>
								<Trash2 class="w-4 h-4" />
								<span>移出追踪</span>
							</Button>
						</Show>
					</div>
				</div>
			</div>

			<Show when={error()}>
				{(msg) => (
					<div class="p-4 border border-error/40 bg-error/10 text-error text-sm">
						{msg()}
					</div>
				)}
			</Show>

			{/* Main Grid: Left Video Meta, Right Tracking State */}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Video Metadata Card */}
				<Card>
					<CardHeader
						variant="bordered"
						title={
							<span class="font-semibold text-primary">
								{t("videoDetail.metadataTitle")}
							</span>
						}
					/>
					<CardContent class="p-4 flex flex-col gap-4">
						<Show
							when={metadata()}
							fallback={
								<div class="py-12 text-center text-tertiary text-sm">
									{loading() ? t("common.loading") : t("common.unknown")}
								</div>
							}
						>
							{(meta) => (
								<div class="flex flex-col gap-4">
									<div class="flex gap-4">
										<Show when={meta().pic}>
											{(pic) => (
												<img
													src={pic()}
													alt={meta().title}
													class="w-36 h-24 object-cover border border-border shrink-0 bg-surface-container-high"
													referrerPolicy="no-referrer"
												/>
											)}
										</Show>
										<div class="flex flex-col gap-1 min-w-0 flex-1">
											<h3 class="text-base font-semibold text-primary line-clamp-2">
												{meta().title}
											</h3>
											<div class="flex items-center gap-2 text-xs text-secondary mt-1">
												<span>{meta().ownerName ?? "—"}</span>
												<span class="text-tertiary">·</span>
												<span>{meta().tname ?? "—"}</span>
											</div>
										</div>
									</div>

									<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-border text-xs">
										<div>
											<span class="text-tertiary block mb-0.5">MID</span>
											<span class="font-medium text-primary">
												{meta().mid ?? "—"}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.duration")}
											</span>
											<span class="font-medium text-primary">
												{meta().duration ? `${meta().duration}s` : "—"}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.pubdate")}
											</span>
											<span class="font-medium text-primary">
												{meta().pubdate
													? formatDateTime(meta().pubdate)
													: "—"}
											</span>
										</div>
									</div>

									<Show when={meta().description}>
										{(desc) => (
											<div class="pt-3 border-t border-border flex flex-col gap-1 text-xs">
												<span class="text-tertiary font-medium">
													{t("videoDetail.description")}
												</span>
												<p class="text-secondary line-clamp-3 leading-relaxed whitespace-pre-wrap">
													{desc()}
												</p>
											</div>
										)}
									</Show>
								</div>
							)}
						</Show>
					</CardContent>
				</Card>

				{/* Tracking & Lifecycle Metrics Card */}
				<Card>
					<CardHeader
						variant="bordered"
						title={
							<span class="font-semibold text-primary">
								{t("videoDetail.tracking")}
							</span>
						}
					/>
					<CardContent class="p-4 flex flex-col gap-4">
						<Show
							when={tracking()}
							fallback={
								<div class="py-12 text-center text-tertiary text-sm">
									{loading() ? t("common.loading") : t("videoDetail.untracked")}
								</div>
							}
						>
							{(track) => (
								<div class="flex flex-col gap-4">
									<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
										<div class="p-3 bg-surface-container-high border border-border">
											<span class="text-xs text-tertiary block mb-1">
												{t("videoDetail.views")}
											</span>
											<span class="text-xl font-bold text-primary">
												{formatMetric(track().lastViews)}
											</span>
										</div>
										<div class="p-3 bg-surface-container-high border border-border">
											<span class="text-xs text-tertiary block mb-1">
												{t("videoDetail.velocity")}
											</span>
											<span class="text-xl font-bold text-primary">
												{formatMetric(track().velocity)}
												<span class="text-xs font-normal text-tertiary ml-1">
													/h
												</span>
											</span>
										</div>
										<div class="p-3 bg-surface-container-high border border-border">
											<span class="text-xs text-tertiary block mb-1">
												{t("videoDetail.priority")}
											</span>
											<span class="text-xl font-bold text-primary">
												{track().priority}
											</span>
										</div>
										<div class="p-3 bg-surface-container-high border border-border">
											<span class="text-xs text-tertiary block mb-1">
												{t("videoDetail.failures")}
											</span>
											<span
												class={
													"text-xl font-bold " +
													(track().consecutiveFails > 0
														? "text-error"
														: "text-primary")
												}
											>
												{track().consecutiveFails}
											</span>
										</div>
									</div>

									<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.scheduleReason")}
											</span>
											<span class="font-medium text-primary">
												{track().scheduleReason ?? "—"}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.targetMilestone")}
											</span>
											<span class="font-medium text-primary">
												{(() => {
													const m = track().targetMilestone;
													return m !== null && m !== undefined
														? formatMetric(m)
														: "—";
												})()}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.eta")}
											</span>
											<span class="font-medium text-primary">
												{track().etaHours != null
													? `${track().etaHours?.toFixed(1)} h`
													: "—"}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.nextSnapshot")}
											</span>
											<span class="font-medium text-primary">
												{formatDateTime(track().nextSnapshotAt)}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.lastCaptured")}
											</span>
											<span class="font-medium text-primary">
												{formatDateTime(track().lastCapturedAt)}
											</span>
										</div>
										<div>
											<span class="text-tertiary block mb-0.5">
												{t("videoDetail.leaseUntil")}
											</span>
											<span class="font-medium text-primary">
												{formatDateTime(track().leaseUntil)}
											</span>
										</div>
									</div>

									<Show when={track().lastError}>
										{(err) => (
											<div class="p-3 bg-error/10 border border-error/30 text-error text-xs flex flex-col gap-1">
												<span class="font-semibold">
													{t("videoDetail.lastError")}:
												</span>
												<span class="break-words font-mono text-[11px]">
													{err()}
												</span>
											</div>
										)}
									</Show>
								</div>
							)}
						</Show>
					</CardContent>
				</Card>
			</div>

			{/* History Table */}
			<VideoHistory
				history={history}
				historyTotal={historyTotal}
				historyPage={historyPage}
				historyError={historyError}
				loadingHistory={loadingHistory}
				loadHistoryPage={(offset) => loadHistory(props.aid, offset)}
				changeLabel={(v) => v}
				fieldLabel={(v) => v}
				pageSize={HISTORY_PAGE_SIZE}
			/>
		</div>
	);
}
