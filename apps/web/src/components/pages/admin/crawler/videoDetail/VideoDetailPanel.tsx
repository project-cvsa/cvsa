import { createEffect, createSignal, For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type {
	BilibiliVideoMetadataDto,
	BilibiliVideoRelationDto,
	TrackingVideoListItem,
	VideoMetadataHistoryListResponse,
	VideoTrackingDto,
} from "@cvsa/contracts";
import { formatDateTime, formatMetric, formatTags } from "../format";
import {
	describeFilterDecision,
	describeMetadataChange,
	describeMetadataField,
	describeTrackingState,
} from "../labels";
import { toMetadataFieldDiffs, readOptionalFieldText } from "../metadataHistory";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";
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

const CLASSIFIER_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
	{ key: "modelScore", label: "Model score" },
	{ key: "modelVersion", label: "Model version" },
];

const ARCHIVE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
	{ key: "cid", label: "CID" },
	{ key: "videos", label: "Parts" },
	{ key: "state", label: "State" },
	{ key: "tidV2", label: "Category ID (v2)" },
	{ key: "tnameV2", label: "Category (v2)" },
	{ key: "dynamic", label: "Dynamic" },
	{ key: "dimension", label: "Dimension" },
	{ key: "pages", label: "Pages" },
	{ key: "staff", label: "Staff" },
	{ key: "rights", label: "Rights" },
	{ key: "honorReply", label: "Honors" },
	{ key: "descV2", label: "Description blocks" },
	{ key: "videoStatus", label: "Video status" },
	{ key: "filterDecision", label: "Filter decision" },
	{ key: "discoverySource", label: "Source" },
	{ key: "modelScore", label: "Model score" },
	{ key: "modelVersion", label: "Model version" },
];

export default function VideoDetailPanel(props: VideoDetailPanelProps) {
	const [tracking, setTracking] = createSignal<VideoTrackingDto | null>(null);
	const [metadata, setMetadata] = createSignal<BilibiliVideoMetadataDto | null>(null);
	const [relations, setRelations] = createSignal<BilibiliVideoRelationDto[] | null>(null);
	const [history, setHistory] = createSignal<VideoMetadataHistoryListResponse | null>(null);
	const [historyOffset, setHistoryOffset] = createSignal(0);
	const [loading, setLoading] = createSignal(false);
	const [loadingHistory, setLoadingHistory] = createSignal(false);
	const [promoting, setPromoting] = createSignal(false);
	const detailRequests = createRequestSequence();
	const historyRequests = createRequestSequence();

	const loadDetail = async (value: string) => {
		const request = detailRequests.start();
		setLoading(true);
		setTracking(null);
		setMetadata(null);
		setRelations(null);
		setHistory(null);
		setHistoryOffset(0);
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
		if (!trackingRes.ok && !metadataRes.ok) {
			toast.error("No video record for AID " + value);
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
			return;
		}
		toast.error(res.ok ? "No history" : res.error.message || "Could not load history");
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
			toast.success("Milestone updated");
			return;
		}
		toast.error(res.ok ? "Update failed" : res.error.message || "Update failed");
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
					Loading
				</div>
			}
		>
			<div class="flex flex-col gap-4">
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

				<Show when={tracking()}>
					{(track) => (
						<div class="p-4 rounded border border-border flex flex-col gap-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<h4 class="ts-caption font-semibold text-primary">Tracking</h4>
								<span class="px-2.5 py-0.5 rounded text-xs font-medium uppercase bg-hover border border-border text-primary">
									{describeTrackingState(track().state)}
								</span>
							</div>
							<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
								<Field label="Views" value={formatMetric(track().lastViews)} />
								<Field
									label="Velocity / hour"
									value={formatMetric(track().velocity)}
								/>
								<Field label="Priority" value={String(track().priority)} />
								<Field
									label="Consecutive fails"
									value={String(track().consecutiveFails)}
								/>
								<Field
									label="Next snapshot"
									value={formatDateTime(track().nextSnapshotAt)}
								/>
								<Field
									label="Last captured"
									value={formatDateTime(track().lastCapturedAt)}
								/>
								<Field
									label="Next metadata"
									value={formatDateTime(track().nextMetadataAt)}
								/>
								<Field
									label="Lease until"
									value={formatDateTime(track().leaseUntil)}
								/>
								<Field
									label="Schedule reason"
									value={track().scheduleReason ?? "—"}
								/>
								<Field
									label="Target milestone"
									value={
										track().targetMilestone === null
											? "—"
											: formatMetric(track().targetMilestone ?? 0)
									}
								/>
								<Field
									label="ETA"
									value={
										track().etaHours === null
											? "—"
											: `${formatMetric(track().etaHours ?? 0)} h`
									}
								/>
								<Field label="Updated" value={formatDateTime(track().updatedAt)} />
							</div>
							<Show when={track().lastError}>
								{(error) => (
									<div class="ts-caption text-red-600 break-words border-t border-border pt-2">
										Last error · {error()}
									</div>
								)}
							</Show>
							<div class="flex flex-wrap items-center gap-2 border-t border-border pt-3">
								<span class="ts-caption text-tertiary">Target milestone</span>
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
							<h4 class="ts-caption font-semibold text-primary">Discovery</h4>
							<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
								<Field label="Video status" value={item().videoStatus ?? "—"} />
								<Field
									label="Filter decision"
									value={
										item().filterDecision
											? describeFilterDecision(item().filterDecision ?? "")
											: "—"
									}
								/>
								<Field label="Source" value={item().discoverySource ?? "—"} />
								<Field label="BVID" value={item().bvid ?? "—"} />
								<Field label="Uploader" value={item().ownerName ?? "—"} />
								<For each={readExtraFields(item(), CLASSIFIER_FIELDS)}>
									{(field) => <Field label={field.label} value={field.value} />}
								</For>
							</div>
						</div>
					)}
				</Show>

				<Show when={metadata()}>
					{(video) => (
						<div class="p-4 rounded border border-border flex flex-col gap-3">
							<h4 class="ts-caption font-semibold text-primary">Metadata</h4>
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
								<Field label="Uploader" value={video().ownerName ?? "—"} />
								<Field label="Duration" value={`${video().duration}s`} />
								<Field label="Category" value={video().tname ?? "—"} />
								<Field
									label="Category ID"
									value={video().tid === null ? "—" : String(video().tid ?? "")}
								/>
								<Field
									label="Published"
									value={formatDateTime(video().pubdate, true)}
								/>
								<Field
									label="Created"
									value={formatDateTime(video().ctime, true)}
								/>
								<Field
									label="Captured"
									value={formatDateTime(video().capturedAt)}
								/>
								<Field label="Updated" value={formatDateTime(video().updatedAt)} />
								<For each={readExtraFields(video(), ARCHIVE_FIELDS)}>
									{(field) => <Field label={field.label} value={field.value} />}
								</For>
							</div>
							<Show when={video().description}>
								{(description) => (
									<p class="ts-caption text-tertiary whitespace-pre-line break-words line-clamp-4">
										{description()}
									</p>
								)}
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

				<div class="p-4 rounded border border-border flex flex-col gap-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h4 class="ts-caption font-semibold text-primary">Metadata history</h4>
						<span class="ts-caption text-tertiary">{historyTotal()} changes</span>
					</div>
					<Show
						when={(history()?.items.length ?? 0) > 0}
						fallback={
							<div class="ts-caption text-tertiary">
								{loadingHistory() ? "Loading" : "No changes"}
							</div>
						}
					>
						<div class="flex flex-col gap-3">
							<For each={history()?.items ?? []}>
								{(item) => (
									<div class="flex flex-col gap-2 border-b border-border pb-3">
										<div class="flex flex-wrap items-center gap-2">
											<span class="px-2 py-0.5 rounded ts-caption font-medium bg-hover border border-border text-primary">
												{describeMetadataChange(item.changeType)}
											</span>
											<span class="ts-caption text-tertiary">
												{formatDateTime(item.capturedAt)}
											</span>
										</div>
										<div class="overflow-x-auto">
											<table class="w-full text-left ts-caption">
												<thead>
													<tr class="border-b border-border text-tertiary">
														<th class="py-1 px-2">Field</th>
														<th class="py-1 px-2">Before</th>
														<th class="py-1 px-2">After</th>
													</tr>
												</thead>
												<tbody>
													<For
														each={toMetadataFieldDiffs(
															item.changedFields
														)}
													>
														{(diff) => (
															<tr class="border-b border-border">
																<td class="py-1 px-2 text-secondary">
																	{describeMetadataField(
																		diff.field
																	)}
																</td>
																<td class="py-1 px-2 text-tertiary break-words">
																	{diff.before}
																</td>
																<td class="py-1 px-2 text-primary break-words">
																	{diff.after}
																</td>
															</tr>
														)}
													</For>
												</tbody>
											</table>
										</div>
									</div>
								)}
							</For>
						</div>
					</Show>
					<Show when={historyTotal() > HISTORY_PAGE_SIZE}>
						<div class="flex items-center justify-between gap-2 border-t border-border pt-3">
							<span class="ts-caption text-tertiary">
								{formatPageLabel(historyPage(), historyTotal(), HISTORY_PAGE_SIZE)}
							</span>
							<div class="flex gap-2">
								<Button
									size="sm"
									variant="outlined"
									disabled={loadingHistory() || historyPage() === 0}
									onClick={() =>
										void loadHistoryPage(
											getPageOffset(historyPage() - 1, HISTORY_PAGE_SIZE)
										)
									}
								>
									Previous
								</Button>
								<Button
									size="sm"
									variant="outlined"
									disabled={
										loadingHistory() ||
										!hasNextPage(
											historyPage(),
											historyTotal(),
											HISTORY_PAGE_SIZE
										)
									}
									onClick={() =>
										void loadHistoryPage(
											getPageOffset(historyPage() + 1, HISTORY_PAGE_SIZE)
										)
									}
								>
									Next
								</Button>
							</div>
						</div>
					</Show>
				</div>

				<Show when={(relations()?.length ?? 0) > 0}>
					<div class="p-4 rounded border border-border flex flex-col gap-3">
						<h4 class="ts-caption font-semibold text-primary">
							Relations · {relations()?.length ?? 0}
						</h4>
						<div class="overflow-x-auto">
							<table class="w-full text-left ts-caption">
								<thead>
									<tr class="border-b border-border text-tertiary">
										<th class="py-2 px-3">Position</th>
										<th class="py-2 px-3">Target AID</th>
										<th class="py-2 px-3">Captured</th>
									</tr>
								</thead>
								<tbody>
									<For each={relations() ?? []}>
										{(relation) => (
											<tr class="border-b border-border hover:bg-hover">
												<td class="py-2 px-3 font-mono text-tertiary">
													{relation.position}
												</td>
												<td class="py-2 px-3 font-mono text-primary">
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
