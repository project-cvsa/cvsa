import StateBadge from "../StateBadge";
import { createSignal, onMount, Show } from "solid-js";
import { cn } from "@lib/cn";
import Button from "@components/ui/Button";
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

type DiscoveryContextDto = NonNullable<BilibiliVideoMetadataDto["discoveryContext"]>;

function DiscoveryContextSummary(props: { data: DiscoveryContextDto }) {
	const t = getComponentT("crawler");
	const origin = () => props.data.origin;
	const decision = () => props.data.decision;

	const channelLabel = (channel: string) => {
		switch (channel) {
			case "search":
				return t("videoDetail.channel.search");
			case "related":
				return t("videoDetail.channel.related");
			case "graph":
				return t("videoDetail.channel.graph");
			default:
				return t("videoDetail.channel.manual");
		}
	};

	const outcomeLabel = (outcome: string) =>
		outcome === "accepted"
			? t("videoDetail.outcome.accepted")
			: t("videoDetail.outcome.rejected");

	const reasonLabel = (reason: string) => {
		switch (reason) {
			case "whitelist_match":
				return t("videoDetail.reason.whitelistMatch");
			case "model_accept":
				return t("videoDetail.reason.modelAccept");
			case "model_reject":
				return t("videoDetail.reason.modelReject");
			case "model_unavailable":
				return t("videoDetail.reason.modelUnavailable");
			case "duration_out_of_range":
				return t("videoDetail.reason.durationOutOfRange");
			case "blacklist_match":
				return t("videoDetail.reason.blacklistMatch");
			default:
				return reason;
		}
	};

	return (
		<div class="pt-3 border-t border-border flex flex-col gap-2 ts-caption">
			<span class="text-tertiary font-medium">{t("videoDetail.discoveryOrigin")}</span>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<span class="text-tertiary block">{t("videoDetail.channel")}</span>
					<span class="text-primary">{channelLabel(origin().channel)}</span>
				</div>
				<Show when={origin().search}>
					{(search) => (
						<>
							<div>
								<span class="text-tertiary block">{t("videoDetail.keyword")}</span>
								<span class="text-primary">{search().keyword}</span>
							</div>
							<div>
								<span class="text-tertiary block">{t("videoDetail.position")}</span>
								<span class="text-primary">
									{t("videoDetail.page")} {search().page} ·{" "}
									{t("videoDetail.position")} {search().position}
								</span>
							</div>
						</>
					)}
				</Show>
				<Show when={origin().related}>
					{(related) => (
						<>
							<div>
								<span class="text-tertiary block">
									{t("videoDetail.sourceAid")}
								</span>
								<a
									href={`https://www.bilibili.com/video/av${related().sourceAid}`}
									target="_blank"
									rel="noopener noreferrer"
									class="text-primary hover:underline"
								>
									av{related().sourceAid}
								</a>
							</div>
							<div>
								<span class="text-tertiary block">{t("videoDetail.position")}</span>
								<span class="text-primary">{related().position}</span>
							</div>
						</>
					)}
				</Show>
			</div>

			<Show when={decision()}>
				{(value) => (
					<div class="grid grid-cols-2 gap-2 pt-2 border-t border-border">
						<div>
							<span class="text-tertiary block">{t("videoDetail.decision")}</span>
							<span class="text-primary">
								{outcomeLabel(value().outcome)} · {reasonLabel(value().reason)}
							</span>
						</div>
						<div>
							<span class="text-tertiary block">
								{value().model
									? t("videoDetail.songProbability")
									: t("videoDetail.confidence")}
							</span>
							<span class="text-primary">
								{(value().confidence * 100).toFixed(1)}%
							</span>
						</div>
						<Show when={value().model}>
							{(model) => (
								<div>
									<span class="text-tertiary block">
										{t("videoDetail.model")}
									</span>
									<span class="text-primary">
										{model().modelVersion} ·{" "}
										{(model().songProbability * 100).toFixed(1)}%
									</span>
								</div>
							)}
						</Show>
						<Show when={value().rules?.matchedSinger}>
							{(singer) => (
								<div>
									<span class="text-tertiary block">
										{t("videoDetail.matchedSinger")}
									</span>
									<span class="text-primary">{singer()}</span>
								</div>
							)}
						</Show>
					</div>
				)}
			</Show>
		</div>
	);
}

function VideoMetadataSummary(props: { data: BilibiliVideoMetadataDto }) {
	const t = getComponentT("crawler");
	return (
		<div class="flex flex-col gap-4">
			<div class="flex gap-4">
				<Show when={props.data.pic}>
					{(pic) => (
						<img
							src={pic()}
							alt={props.data.title}
							class="w-36 h-24 object-cover border border-border shrink-0 bg-surface-container-high"
							referrerPolicy="no-referrer"
						/>
					)}
				</Show>
				<div class="flex flex-col gap-1 min-w-0 flex-1">
					<h3 class="text-body tracking-body font-semibold text-primary line-clamp-2">
						{props.data.title}
					</h3>
					<div class="flex items-center gap-2 ts-caption text-secondary mt-1">
						<span>{props.data.ownerName ?? "—"}</span>
						<span class="text-tertiary">·</span>
						<span>{props.data.tname ?? "—"}</span>
					</div>
				</div>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-border ts-caption">
				<div>
					<span class="text-tertiary block mb-0.5">MID</span>
					<span class="font-medium text-primary">{props.data.mid ?? "—"}</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">{t("videoDetail.duration")}</span>
					<span class="font-medium text-primary">
						{props.data.duration ? `${props.data.duration}s` : "—"}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">{t("videoDetail.pubdate")}</span>
					<span class="font-medium text-primary">
						{props.data.pubdate ? formatDateTime(props.data.pubdate) : "—"}
					</span>
				</div>
			</div>

			<Show when={props.data.description}>
				{(desc) => (
					<div class="pt-3 border-t border-border flex flex-col gap-1 ts-caption">
						<span class="text-tertiary font-medium">
							{t("videoDetail.description")}
						</span>
						<p class="text-secondary line-clamp-3 whitespace-pre-wrap">{desc()}</p>
					</div>
				)}
			</Show>

			<Show when={props.data.discoveryContext}>
				{(context) => <DiscoveryContextSummary data={context()} />}
			</Show>
		</div>
	);
}

function TrackingSummary(props: { data: VideoTrackingDto }) {
	const t = getComponentT("crawler");
	return (
		<div class="flex flex-col gap-4">
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
				<div class="p-3 bg-surface-container-high border border-border">
					<span class="ts-caption text-tertiary block mb-1">
						{t("videoDetail.views")}
					</span>
					<span class="text-heading-3 tracking-heading-3 font-bold text-primary">
						{formatMetric(props.data.lastViews)}
					</span>
				</div>
				<div class="p-3 bg-surface-container-high border border-border">
					<span class="ts-caption text-tertiary block mb-1">
						{t("videoDetail.velocity")}
					</span>
					<span class="text-heading-3 tracking-heading-3 font-bold text-primary">
						{formatMetric(props.data.velocity)}
						<span class="ts-caption text-tertiary ml-1">/h</span>
					</span>
				</div>
				<div class="p-3 bg-surface-container-high border border-border">
					<span class="ts-caption text-tertiary block mb-1">
						{t("videoDetail.priority")}
					</span>
					<span class="text-heading-3 tracking-heading-3 font-bold text-primary">
						{props.data.priority}
					</span>
				</div>
				<div class="p-3 bg-surface-container-high border border-border">
					<span class="ts-caption text-tertiary block mb-1">
						{t("videoDetail.failures")}
					</span>
					<span
						class={cn(
							"text-heading-3 tracking-heading-3 font-bold",
							props.data.consecutiveFails > 0 ? "text-error" : "text-primary"
						)}
					>
						{props.data.consecutiveFails}
					</span>
				</div>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 ts-caption">
				<div>
					<span class="text-tertiary block mb-0.5">
						{t("videoDetail.scheduleReason")}
					</span>
					<span class="font-medium text-primary">{props.data.scheduleReason ?? "—"}</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">
						{t("videoDetail.targetMilestone")}
					</span>
					<span class="font-medium text-primary">
						{(() => {
							const m = props.data.targetMilestone;
							return m !== null && m !== undefined ? formatMetric(m) : "—";
						})()}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">{t("videoDetail.eta")}</span>
					<span class="font-medium text-primary">
						{props.data.etaHours != null ? `${props.data.etaHours?.toFixed(1)} h` : "—"}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">{t("videoDetail.nextSnapshot")}</span>
					<span class="font-medium text-primary">
						{formatDateTime(props.data.nextSnapshotAt)}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">{t("videoDetail.lastCaptured")}</span>
					<span class="font-medium text-primary">
						{formatDateTime(props.data.lastCapturedAt)}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-0.5">{t("videoDetail.leaseUntil")}</span>
					<span class="font-medium text-primary">
						{formatDateTime(props.data.leaseUntil)}
					</span>
				</div>
			</div>

			<Show when={props.data.lastError}>
				{(err) => (
					<div class="p-3 bg-error/10 border border-error/30 text-error ts-caption flex flex-col gap-1">
						<span class="font-semibold">{t("videoDetail.lastError")}:</span>
						<span class="break-words text-overline tracking-overline">{err()}</span>
					</div>
				)}
			</Show>
		</div>
	);
}

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

		if (metaRes.ok) setMetadata(metaRes.data ?? null);
		else if (metaRes.status === 404) setMetadata(null);
		if (trackRes.ok) setTracking(trackRes.data ?? null);
		else if (trackRes.status === 404) setTracking(null);

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
			toast.success(t("audit.untracked"));
			setTracking(null);
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	onMount(() => {
		void loadDetail(props.aid);
	});

	const historyTotal = () => history()?.total ?? 0;
	const historyPage = () => Math.floor(historyOffset() / HISTORY_PAGE_SIZE);

	return (
		<div class="crawler-panel flex flex-col gap-6">
			{/* Breadcrumb Navigation & Action Toolbar */}
			<div class="flex flex-col gap-3">
				<div>
					<a
						href={`/admin/crawler?section=videos&search=${encodeURIComponent(props.aid)}`}
						class="ts-caption text-secondary hover:text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer"
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
									class="inline-flex items-center gap-1 text-label tracking-label font-medium text-primary hover:underline"
								>
									<span>{bvid()}</span>
									<ExternalLink class="w-3.5 h-3.5 text-tertiary" />
								</a>
							)}
						</Show>
						<Show when={tracking()?.state}>
							{(st) => <StateBadge kind="tracking" state={st()} size="md" />}
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
								<span>{t("videoDetail.untrack")}</span>
							</Button>
						</Show>
					</div>
				</div>
			</div>

			<Show when={error()}>
				{(msg) => (
					<div class="p-4 border border-error/40 bg-error/10 text-error text-label tracking-label">
						{msg()}
					</div>
				)}
			</Show>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<section class="flex flex-col gap-3">
					<h3 class="ts-heading-3 text-primary">{t("videoDetail.metadataTitle")}</h3>
					<Show
						when={metadata()}
						fallback={
							<div class="py-12 text-center text-tertiary text-label tracking-label">
								{loading() ? t("common.loading") : t("common.unknown")}
							</div>
						}
					>
						{(meta) => <VideoMetadataSummary data={meta()} />}
					</Show>
				</section>

				<section class="flex flex-col gap-3">
					<h3 class="ts-heading-3 text-primary">{t("videoDetail.tracking")}</h3>
					<Show
						when={tracking()}
						fallback={
							<div class="py-12 text-center text-tertiary text-label tracking-label">
								{loading() ? t("common.loading") : t("videoDetail.untracked")}
							</div>
						}
					>
						{(track) => <TrackingSummary data={track()} />}
					</Show>
				</section>
			</div>

			{/* History Table */}
			<VideoHistory
				history={history}
				historyTotal={historyTotal}
				historyPage={historyPage}
				historyError={historyError}
				loadingHistory={loadingHistory}
				loadHistoryPage={(offset) => loadHistory(props.aid, offset)}
				pageSize={HISTORY_PAGE_SIZE}
			/>
		</div>
	);
}
