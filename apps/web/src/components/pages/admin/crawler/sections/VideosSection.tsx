import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Select, { type SelectOption } from "@components/ui/Select";
import TextField from "@components/ui/TextField";
import Modal from "@components/ui/Modal";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { TrackingVideoListItem, TrackingVideoListResponse } from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";
import { createRequestSequence } from "../videoActions";
import VideoDetailPanel from "../videoDetail/VideoDetailPanel";
import Video from "lucide-solid/icons/video";
import Search from "lucide-solid/icons/search";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import ExternalLink from "lucide-solid/icons/external-link";
import Eye from "lucide-solid/icons/eye";

const PAGE_SIZE = 10;

type StateFilter = "all" | "new" | "regular" | "milestone" | "archive";

export default function VideosSection() {
	const t = getComponentT("crawler");

	const [stateFilter, setStateFilter] = createSignal<StateFilter>("all");
	const [searchInput, setSearchInput] = createSignal("");
	const [appliedSearch, setAppliedSearch] = createSignal("");
	const [page, setPage] = createSignal(0);
	const [list, setList] = createSignal<TrackingVideoListResponse | null>(null);
	const [loadingList, setLoadingList] = createSignal(false);
	const [listError, setListError] = createSignal<string | null>(null);
	const [detailAid, setDetailAid] = createSignal("");
	const [selected, setSelected] = createSignal<TrackingVideoListItem | null>(null);
	const [modalOpen, setModalOpen] = createSignal(false);
	const listRequests = createRequestSequence();

	const stateOptions: SelectOption[] = [
		{ value: "all", label: t("videos.state.all") },
		{ value: "new", label: t("videos.state.new") },
		{ value: "regular", label: t("videos.state.regular") },
		{ value: "milestone", label: t("videos.state.milestone") },
		{ value: "archive", label: t("videos.state.archive") },
	];

	const loadList = async () => {
		const request = listRequests.start();
		setLoadingList(true);
		const res = await api.crawler.listTrackingVideos({
			limit: PAGE_SIZE,
			offset: getPageOffset(page(), PAGE_SIZE),
			...(stateFilter() === "all" ? {} : { state: stateFilter() }),
			...(appliedSearch().trim() ? { search: appliedSearch().trim() } : {}),
		});
		if (!listRequests.isCurrent(request)) return;
		setLoadingList(false);
		if (!res.ok) {
			setListError(res.error.message || t("common.error"));
			return;
		}
		if (!res.data) {
			setListError(t("common.unknown"));
			return;
		}
		setListError(null);
		setList(res.data);
		const safePage = Math.min(page(), Math.max(0, Math.ceil(res.data.total / PAGE_SIZE) - 1));
		if (safePage !== page()) {
			setPage(safePage);
			void loadList();
		}
	};

	const inspect = (aid: string, item?: TrackingVideoListItem) => {
		const trimmed = aid.trim();
		if (!trimmed) return;
		setSelected(item ?? null);
		setDetailAid(trimmed);
		setModalOpen(true);
	};

	const runSearch = () => {
		const value = searchInput().trim();
		setAppliedSearch(value);
		setPage(0);
		void loadList();
		if (/^\d+$/.test(value)) {
			inspect(value);
		}
	};

	const stateBadge = (state: string) => {
		switch (state) {
			case "new":
				return (
					<Badge variant="info" size="sm">
						{t("videos.state.new")}
					</Badge>
				);
			case "regular":
				return (
					<Badge variant="neutral" size="sm">
						{t("videos.state.regular")}
					</Badge>
				);
			case "milestone":
				return (
					<Badge variant="warning" size="sm">
						{t("videos.state.milestone")}
					</Badge>
				);
			case "archive":
				return (
					<Badge variant="neutral" size="sm">
						{t("videos.state.archive")}
					</Badge>
				);
			default:
				return (
					<Badge variant="neutral" size="sm">
						{state}
					</Badge>
				);
		}
	};

	onMount(() => {
		void loadList();
	});

	const total = () => list()?.total ?? 0;

	return (
		<div class="flex flex-col gap-6">
			{/* Page Subtitle & Description */}
			<div class="bg-surface p-5 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex flex-col gap-1.5">
					<h2 class="ts-heading-2 text-primary flex items-center gap-2">
						<Video class="w-5 h-5 text-primary" />
						<span>{t("videos.title")}</span>
						<Badge variant="neutral" size="sm">
							{total()} tracked
						</Badge>
					</h2>
					<p class="ts-body text-secondary text-sm leading-relaxed max-w-3xl">
						{t("videos.description")}
					</p>
				</div>

				<Button
					size="sm"
					variant="outlined"
					disabled={loadingList()}
					onClick={() => void loadList()}
					class="gap-1.5 shrink-0 self-start sm:self-auto"
				>
					<RefreshCw class={"w-3.5 h-3.5 " + (loadingList() ? "animate-spin" : "")} />
					<span>{loadingList() ? t("common.refreshing") : t("common.refresh")}</span>
				</Button>
			</div>

			{/* Main Video List Card */}
			<Card>
				<CardHeader
					title={t("videos.title")}
					description={list() ? `${t("common.total")} ${total()}` : undefined}
					actions={
						<div class="flex flex-wrap items-center gap-3">
							<div class="w-44">
								<Select
									label={t("common.filter")}
									options={stateOptions}
									value={stateFilter()}
									onValueChange={(val) => {
										if (val) {
											setStateFilter(val as StateFilter);
											setPage(0);
											void loadList();
										}
									}}
								/>
							</div>

							<div class="w-64">
								<TextField
									label={t("common.search")}
									value={searchInput()}
									onInput={(e) => setSearchInput(e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") runSearch();
									}}
								/>
							</div>

							<Button
								size="md"
								variant="filled"
								disabled={loadingList()}
								onClick={runSearch}
								class="gap-1.5"
							>
								<Search
									class={"w-4 h-4 " + (loadingList() ? "animate-spin" : "")}
								/>
								<span>
									{loadingList() ? t("common.loading") : t("common.search")}
								</span>
							</Button>
						</div>
					}
				/>
				<CardContent class="p-0">
					<Show
						when={list()}
						fallback={
							<div class="p-10 text-center text-tertiary">
								{loadingList()
									? t("common.loading")
									: listError() !== null
										? listError()
										: t("common.unknown")}
							</div>
						}
					>
						{(current) => (
							<div>
								<Show
									when={current().items.length > 0}
									fallback={
										<div class="p-10 text-center text-tertiary">
											{t("videos.empty")}
										</div>
									}
								>
									<div class="overflow-x-auto">
										<table class="w-full text-left ts-caption">
											<thead>
												<tr class="border-b border-border text-tertiary bg-surface-container-low/50">
													<th class="py-3 px-4 font-medium">
														{t("videos.col.aid")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("videos.col.bvid")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("videos.col.state")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("videos.col.views")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("videos.col.velocity")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("videos.col.nextSnapshot")}
													</th>
													<th class="py-3 px-4 font-medium text-right">
														{t("videos.col.action")}
													</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-border">
												<For each={current().items}>
													{(item) => (
														<tr class="hover:bg-hover/50 transition-colors">
															<td class="py-3 px-4">
																<button
																	type="button"
																	class="font-medium text-primary hover:underline focus:outline-none"
																	onClick={() =>
																		inspect(item.aid, item)
																	}
																>
																	{item.aid}
																</button>
															</td>
															<td class="py-3 px-4">
																<a
																	href={`https://www.bilibili.com/video/${item.bvid}`}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="inline-flex items-center gap-1 text-primary hover:text-primary-focus hover:underline"
																>
																	<span>{item.bvid}</span>
																	<ExternalLink class="w-3 h-3 text-tertiary" />
																</a>
															</td>
															<td class="py-3 px-4">
																{stateBadge(item.state)}
															</td>
															<td class="py-3 px-4 font-medium text-primary">
																{item.lastViews !== null
																	? formatMetric(item.lastViews)
																	: "—"}
															</td>
															<td class="py-3 px-4 text-secondary">
																{typeof item.velocity === "number"
																	? `${item.velocity.toFixed(1)}/h`
																	: "—"}
															</td>
															<td class="py-3 px-4 text-tertiary">
																{formatDateTime(
																	item.nextSnapshotAt
																)}
															</td>
															<td class="py-3 px-4 text-right">
																<Button
																	size="sm"
																	variant="outlined"
																	onClick={() =>
																		inspect(item.aid, item)
																	}
																	class="gap-1.5"
																>
																	<Eye class="w-3.5 h-3.5" />
																	<span>
																		{t("videos.action.detail")}
																	</span>
																</Button>
															</td>
														</tr>
													)}
												</For>
											</tbody>
										</table>
									</div>
								</Show>

								{/* Pagination */}
								<div class="px-5 py-3 border-t border-border flex items-center justify-between">
									<span class="ts-caption text-tertiary">
										{formatPageLabel(page(), PAGE_SIZE, current().total)}
									</span>
									<div class="flex items-center gap-2">
										<Button
											size="sm"
											variant="outlined"
											disabled={page() === 0 || loadingList()}
											onClick={() => {
												setPage((p) => Math.max(0, p - 1));
												void loadList();
											}}
										>
											{t("common.previous")}
										</Button>
										<Button
											size="sm"
											variant="outlined"
											disabled={
												!hasNextPage(page(), PAGE_SIZE, current().total) ||
												loadingList()
											}
											onClick={() => {
												setPage((p) => p + 1);
												void loadList();
											}}
										>
											{t("common.next")}
										</Button>
									</div>
								</div>
							</div>
						)}
					</Show>
				</CardContent>
			</Card>

			{/* Video Detail Modal */}
			<Modal
				isOpen={modalOpen()}
				onClose={() => setModalOpen(false)}
				title={t("videos.modal.title")}
				size="xl"
			>
				<div class="p-4">
					<VideoDetailPanel aid={detailAid} selected={selected} />
				</div>
			</Modal>
		</div>
	);
}
