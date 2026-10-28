import { createEffect, createSignal, For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	BilibiliVideoMetadataDto,
	BilibiliVideoRelationDto,
	TrackingVideoListItem,
	VideoMetadataHistoryListResponse,
	VideoTrackingDto,
} from "@cvsa/contracts";
import { formatDateTime, formatMetric, formatTags } from "../format";
import { readOptionalFieldText } from "../metadataHistory";
import VideoHistory from "./VideoHistory";
import { createRequestSequence, getMilestoneActionAid } from "../videoActions";

const HISTORY_PAGE_SIZE = 10;

type VideoDetailPanelProps = {
	aid: Accessor<string>;
	selected: Accessor<TrackingVideoListItem | null>;
};

function Field(props: { label: string; value: string }) {
	return (
		<div class="flex flex-col gap-0.5">
			<span class="ts-caption text-tertiary">{props.label}</span>
			<span class="ts-caption font-medium text-primary break-words">{props.value}</span>
		</div>
	);
}

type ExtraField = { label: string; value: string };

/**
 * Rich archive fields. Every one is optional on the DTO, so the panel renders a
 * row only when the API returned a value.
 */
function readExtraFields(
	source: object,
	fields: ReadonlyArray<{ key: string; label: string }>
): ExtraField[] {
	return fields.flatMap(({ key, label }) => {
		const value = readOptionalFieldText(source, key);
		return value === null ? [] : [{ label, value }];
	});
}

export default function VideoDetailPanel(props: VideoDetailPanelProps) {
	const t = getComponentT("crawler");
	const classifierFields = ["modelScore", "modelVersion"].map((key) => ({
		key,
		label: t(`videoDetail.field.${key}`),
	}));
	const archiveFields = [
		"cid",
		"videos",
		"state",
		"tidV2",
		"tnameV2",
		"dynamic",
		"dimension",
		"pages",
		"staff",
		"rights",
		"honorReply",
		"descV2",
		"videoStatus",
		"filterDecision",
		"discoverySource",
		"modelScore",
		"modelVersion",
	].map((key) => ({ key, label: t(`videoDetail.field.${key}`) }));
	const trackingLabels: Record<string, string> = {
		new: t("videos.state.new"),
		regular: t("videos.state.regular"),
		milestone: t("videos.state.milestone"),
		archive: t("videos.state.archive"),
	};
	const filterLabels: Record<string, string> = {
		accepted: t("videoDetail.accepted"),
		rejected: t("videoDetail.rejected"),
	};
	const changeLabels: Record<string, string> = {
		created: t("videoDetail.created"),
		updated: t("videoDetail.updated"),
		status_changed: t("videoDetail.statusChanged"),
	};
	const fieldLabels: Record<string, string> = Object.fromEntries(
		[
			"title",
			"description",
			"pic",
			"tid",
			"tname",
			"ownerName",
			"duration",
			"state",
			"videoStatus",
			"tags",
			"pages",
			"staff",
		].map((key) => [key, t(`videoDetail.field.${key}`)])
	);
	const errorLabel = (value: string) => {
		if (value === "network:rate_limited") return t("videoDetail.rateLimited");
		if (value === "network:adapter_unavailable") return t("videoDetail.adapterUnavailable");
		const apiError = /^bilibili_api_error:(-?\d+)$/.exec(value);
		if (apiError) return `${t("videoDetail.bilibiliError")} (${apiError[1]})`;
		return value;
	};
	const trackingLabel = (value: string) => trackingLabels[value] ?? value;
	const filterLabel = (value: string) => filterLabels[value] ?? value;
	const changeLabel = (value: string) => changeLabels[value] ?? value;
	const fieldLabel = (value: string) => fieldLabels[value] ?? value;

	const [tracking, setTracking] = createSignal<VideoTrackingDto | null>(null);
	const [metadata, setMetadata] = createSignal<BilibiliVideoMetadataDto | null>(null);
	const [relations, setRelations] = createSignal<BilibiliVideoRelationDto[] | null>(null);
	const [history, setHistory] = createSignal<VideoMetadataHistoryListResponse | null>(null);
	const [historyOffset, setHistoryOffset] = createSignal(0);
	const [historyError, setHistoryError] = createSignal<string | null>(null);
	const [detailError, setDetailError] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [loadingHistory, setLoadingHistory] = createSignal(false);
	const [promoting, setPromoting] = createSignal(false);
	const [pendingAction, setPendingAction] = createSignal<"snapshot" | "metadata" | null>(null);
	const [showAdvanced, setShowAdvanced] = createSignal(false);
	const detailRequests = createRequestSequence();
	const historyRequests = createRequestSequence();

	const loadDetail = async (value: string) => {
		const request = detailRequests.start();
		historyRequests.start();
		setLoadingHistory(false);
		setDetailError(null);
		setHistoryError(null);
		setLoading(true);
		setTracking(null);
		setMetadata(null);
		setRelations(null);
		setHistory(null);
		setHistoryOffset(0);
		setShowAdvanced(false);
		const [trackingRes, metadataRes, relationsRes, historyRes] = await Promise.all([
			api.crawler.getTracking(value),
			api.crawler.getMetadata(value),
			api.crawler.getRelations(value),
			api.crawler.getMetadataHistory(value, { limit: HISTORY_PAGE_SIZE, offset: 0 }),
		]);
		if (!detailRequests.isCurrent(request)) return;
		setLoading(false);
		setTracking(trackingRes.ok ? trackingRes.data : null);
		setMetadata(metadataRes.ok ? metadataRes.data : null);
		setRelations(relationsRes.ok ? relationsRes.data : null);
		setHistory(historyRes.ok ? historyRes.data : null);
		if (!historyRes.ok)
			setHistoryError(historyRes.error.message || t("videoDetail.historyFailed"));
		if (!trackingRes.ok && !metadataRes.ok) {
			setDetailError(
				trackingRes.error.message ||
					metadataRes.error.message ||
					t("videoDetail.loadFailed")
			);
		}
	};

	const loadHistoryPage = async (offset: number) => {
		const value = props.aid().trim();
		if (!value || loadingHistory()) return;
		const request = historyRequests.start();
		setLoadingHistory(true);
		const res = await api.crawler.getMetadataHistory(value, {
			limit: HISTORY_PAGE_SIZE,
			offset,
		});
		if (!historyRequests.isCurrent(request)) return;
		setLoadingHistory(false);
		if (res.ok && res.data) {
			setHistory(res.data);
			setHistoryOffset(offset);
			setHistoryError(null);
			return;
		}
		setHistoryError(
			res.ok
				? t("videoDetail.historyFailed")
				: res.error.message || t("videoDetail.historyFailed")
		);
	};

	const queueVideoAction = async (kind: "snapshot" | "metadata") => {
		const aid = props.aid().trim();
		if (!aid || pendingAction()) return;
		setPendingAction(kind);
		const result =
			kind === "snapshot"
				? await api.crawler.queueSnapshot(aid)
				: await api.crawler.fetchDetail(aid);
		setPendingAction(null);
		if (result.ok) toast.success(t("videoDetail.actionQueued"));
		else toast.error(result.error.message || t("common.error"));
	};

	const promoteMilestone = async (targetMilestone: number) => {
		const value = getMilestoneActionAid(tracking(), loading() || promoting());
		if (!value) return;
		setPromoting(true);
		const res = await api.crawler.promoteTracking(value, {
			targetMilestone,
			priority: 1,
		});
		setPromoting(false);
		if (res.ok && res.data) {
			if (tracking()?.aid === value) setTracking(res.data);
			toast.success(t("videoDetail.milestoneUpdated"));
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	createEffect(() => {
		const value = props.aid().trim();
		if (!value) return;
		void loadDetail(value);
	});

	const historyTotal = () => history()?.total ?? 0;
	const historyPage = () => Math.floor(historyOffset() / HISTORY_PAGE_SIZE);

	return (
		<Show
			when={!loading()}
			fallback={
				<div class="p-6 text-center text-tertiary border border-border rounded">
					{t("common.loading")}
				</div>
			}
		>
			<div class="flex flex-col gap-4">
				<Show when={detailError()}>
					{(error) => (
						<p role="alert" class="ts-caption text-error">
							{error()}
						</p>
					)}
				</Show>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="ts-subhead font-semibold text-primary">
						AID {props.aid()}
						<Show when={metadata()?.title}>
							{(title) => (
								<span class="ml-2 font-normal text-tertiary">{title()}</span>
							)}
						</Show>
					</h3>
					<Button
						size="sm"
						variant="outlined"
						onClick={() => void loadDetail(props.aid())}
					>
						Reload
					</Button>
				</div>

				<div class="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outlined"
						disabled={pendingAction() !== null}
						onClick={() => void queueVideoAction("snapshot")}
					>
						{pendingAction() === "snapshot"
							? t("common.loading")
							: t("videoDetail.queueSnapshot")}
					</Button>
					<Button
						size="sm"
						variant="outlined"
						disabled={pendingAction() !== null}
						onClick={() => void queueVideoAction("metadata")}
					>
						{pendingAction() === "metadata"
							? t("common.loading")
							: t("videoDetail.queueMetadata")}
					</Button>
				</div>
				<Show when={tracking()}>
					{(track) => (
						<div class="p-4 rounded border border-border flex flex-col gap-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<h4 class="ts-caption font-semibold text-primary">
									{t("videoDetail.tracking")}
								</h4>
								<span class="px-2.5 py-0.5 rounded text-xs font-medium uppercase bg-hover border border-border text-primary">
									{trackingLabel(track().state)}
								</span>
							</div>
							<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
								<Field
									label={t("videoDetail.views")}
									value={formatMetric(track().lastViews)}
								/>
								<Field
									label={t("videoDetail.velocity")}
									value={formatMetric(track().velocity)}
								/>
								<Field
									label={t("videoDetail.priority")}
									value={String(track().priority)}
								/>
								<Field
									label={t("videoDetail.failures")}
									value={String(track().consecutiveFails)}
								/>
								<Field
									label={t("videoDetail.nextSnapshot")}
									value={formatDateTime(track().nextSnapshotAt)}
								/>
								<Field
									label={t("videoDetail.lastCaptured")}
									value={formatDateTime(track().lastCapturedAt)}
								/>
								<Field
									label={t("videoDetail.nextMetadata")}
									value={formatDateTime(track().nextMetadataAt)}
								/>
								<Field
									label={t("videoDetail.leaseUntil")}
									value={formatDateTime(track().leaseUntil)}
								/>
								<Field
									label={t("videoDetail.scheduleReason")}
									value={track().scheduleReason ?? "—"}
								/>
								<Field
									label={t("videoDetail.targetMilestone")}
									value={
										track().targetMilestone === null
											? "—"
											: formatMetric(track().targetMilestone ?? 0)
									}
								/>
								<Field
									label={t("videoDetail.eta")}
									value={
										track().etaHours === null
											? "—"
											: `${formatMetric(track().etaHours ?? 0)} h`
									}
								/>
								<Field
									label={t("videoDetail.updated")}
									value={formatDateTime(track().updatedAt)}
								/>
							</div>
							<Show when={track().lastError}>
								{(error) => (
									<div class="ts-caption text-error break-words border-t border-border pt-2">
										{t("videoDetail.lastError")} · {errorLabel(error())}
									</div>
								)}
							</Show>
							<div class="flex flex-wrap items-center gap-2 border-t border-border pt-3">
								<span class="ts-caption text-tertiary">
									{t("videoDetail.targetMilestone")}
								</span>
								<Button
									size="sm"
									variant="outlined"
									disabled={promoting()}
									onClick={() => void promoteMilestone(100_000)}
								>
									100K
								</Button>
								<Button
									size="sm"
									variant="outlined"
									disabled={promoting()}
									onClick={() => void promoteMilestone(1_000_000)}
								>
									1M
								</Button>
								<Button
									size="sm"
									variant="outlined"
									disabled={promoting()}
									onClick={() => void promoteMilestone(10_000_000)}
								>
									10M
								</Button>
							</div>
						</div>
					)}
				</Show>

				<Show when={props.selected()}>
					{(item) => (
						<div class="p-4 rounded border border-border flex flex-col gap-3">
							<h4 class="ts-caption font-semibold text-primary">
								{t("videoDetail.discovery")}
							</h4>
							<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
								<Field
									label={t("videoDetail.videoStatus")}
									value={item().videoStatus ?? "—"}
								/>
								<Field
									label={t("videoDetail.filterDecision")}
									value={
										item().filterDecision
											? filterLabel(item().filterDecision ?? "")
											: "—"
									}
								/>
								<Field
									label={t("videoDetail.source")}
									value={item().discoverySource ?? "—"}
								/>
								<Field label="BVID" value={item().bvid ?? "—"} />
								<Field
									label={t("videoDetail.uploader")}
									value={item().ownerName ?? "—"}
								/>
								<For each={readExtraFields(item(), classifierFields)}>
									{(field) => <Field label={field.label} value={field.value} />}
								</For>
							</div>
						</div>
					)}
				</Show>

				<Show when={metadata()}>
					{(video) => (
						<div class="p-4 rounded border border-border flex flex-col gap-3">
							<h4 class="ts-caption font-semibold text-primary">
								{t("videoDetail.metadata")}
							</h4>
							<a
								class="ts-body font-medium text-primary hover:underline"
								href={"https://www.bilibili.com/video/" + video().bvid}
								target="_blank"
								rel="noreferrer"
							>
								{video().title}
							</a>
							<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
								<Field label="BVID" value={video().bvid} />
								<Field
									label={t("videoDetail.uploader")}
									value={video().ownerName ?? "—"}
								/>
								<Field
									label={t("videoDetail.duration")}
									value={`${video().duration}s`}
								/>
								<Field
									label={t("videoDetail.category")}
									value={video().tname ?? "—"}
								/>
								<Field
									label={t("videoDetail.categoryId")}
									value={video().tid === null ? "—" : String(video().tid ?? "")}
								/>
								<Field
									label={t("videoDetail.published")}
									value={formatDateTime(video().pubdate, true)}
								/>
								<Field
									label={t("videoDetail.created")}
									value={formatDateTime(video().ctime, true)}
								/>
								<Field
									label={t("videoDetail.captured")}
									value={formatDateTime(video().capturedAt)}
								/>
								<Field
									label={t("videoDetail.updated")}
									value={formatDateTime(video().updatedAt)}
								/>
							</div>
							<Show when={video().description}>
								{(description) => (
									<p class="ts-caption text-tertiary whitespace-pre-line break-words line-clamp-4">
										{description()}
									</p>
								)}
							</Show>
							<Show when={readExtraFields(video(), archiveFields).length > 0}>
								<Button
									size="sm"
									variant="ghost"
									class="self-start"
									aria-expanded={showAdvanced()}
									onClick={() => setShowAdvanced((value) => !value)}
								>
									{showAdvanced()
										? t("videoDetail.hideAdvanced")
										: t("videoDetail.showAdvanced")}
								</Button>
								<Show when={showAdvanced()}>
									<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
										<For each={readExtraFields(video(), archiveFields)}>
											{(field) => (
												<Field label={field.label} value={field.value} />
											)}
										</For>
									</div>
								</Show>
							</Show>
							<Show when={formatTags(video().tags).length > 0}>
								<div class="flex flex-wrap gap-1.5 border-t border-border pt-3">
									<For each={formatTags(video().tags)}>
										{(tag) => (
											<span class="px-2 py-0.5 rounded bg-hover ts-caption text-secondary border border-border">
												{tag}
											</span>
										)}
									</For>
								</div>
							</Show>
						</div>
					)}
				</Show>

				<VideoHistory
					history={history}
					historyTotal={historyTotal}
					historyPage={historyPage}
					historyError={historyError}
					loadingHistory={loadingHistory}
					loadHistoryPage={loadHistoryPage}
					changeLabel={changeLabel}
					fieldLabel={fieldLabel}
					pageSize={HISTORY_PAGE_SIZE}
				/>

				<Show when={(relations()?.length ?? 0) > 0}>
					<div class="p-4 rounded border border-border flex flex-col gap-3">
						<h4 class="ts-caption font-semibold text-primary">
							{t("videoDetail.relations")} · {relations()?.length ?? 0}
						</h4>
						<div class="cvsa-scroll overflow-x-auto">
							<table class="w-full text-left ts-caption">
								<thead>
									<tr class="border-b border-border text-tertiary">
										<th class="py-2 px-3">{t("videoDetail.position")}</th>
										<th class="py-2 px-3">{t("videoDetail.targetAid")}</th>
										<th class="py-2 px-3">{t("videoDetail.captured")}</th>
									</tr>
								</thead>
								<tbody>
									<For each={relations() ?? []}>
										{(relation) => (
											<tr class="border-b border-border hover:bg-hover">
												<td class="py-2 px-3 text-tertiary">
													{relation.position}
												</td>
												<td class="py-2 px-3 text-primary">
													{relation.targetAid}
												</td>
												<td class="py-2 px-3 text-tertiary">
													{formatDateTime(relation.capturedAt)}
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</div>
					</div>
				</Show>
			</div>
		</Show>
	);
}
