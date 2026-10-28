import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Select, { type SelectOption } from "@components/ui/Select";
import TextField from "@components/ui/TextField";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { TrackingVideoListResponse, TrackingVideoSortField } from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";
import { createRequestSequence } from "../videoActions";
import Search from "lucide-solid/icons/search";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import ExternalLink from "lucide-solid/icons/external-link";
import Eye from "lucide-solid/icons/eye";
import ArrowUpDown from "lucide-solid/icons/arrow-up-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";

const PAGE_SIZE = 10;

type StateFilter = "all" | "new" | "regular" | "milestone" | "archive";
type StatusFilter = "all" | "failing" | "highPriority" | "normal";

export default function VideosSection() {
	const t = getComponentT("crawler");

	const [stateFilter, setStateFilter] = createSignal<StateFilter>("all");
	const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
	const [sortBy, setSortBy] = createSignal<TrackingVideoSortField>("updatedAt");
	const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("desc");
	const [searchInput, setSearchInput] = createSignal("");
	const [appliedSearch, setAppliedSearch] = createSignal("");
	const [page, setPage] = createSignal(0);
	const [list, setList] = createSignal<TrackingVideoListResponse | null>(null);
	const [loadingList, setLoadingList] = createSignal(false);
	const [listError, setListError] = createSignal<string | null>(null);
	const listRequests = createRequestSequence();

	const stateOptions: SelectOption[] = [
		{ value: "all", label: `${t("videos.col.state")}: ${t("videos.state.all")}` },
		{ value: "new", label: t("videos.state.new") },
		{ value: "regular", label: t("videos.state.regular") },
		{ value: "milestone", label: t("videos.state.milestone") },
		{ value: "archive", label: t("videos.state.archive") },
	];

	const statusOptions: SelectOption[] = [
		{ value: "all", label: "健康状况: 全部" },
		{ value: "failing", label: "仅查看抓取失败" },
		{ value: "highPriority", label: "高优初采重点" },
		{ value: "normal", label: "正常运行中" },
	];

	const loadList = async () => {
		const request = listRequests.start();
		setLoadingList(true);
		const res = await api.crawler.listTrackingVideos({
			limit: PAGE_SIZE,
			offset: getPageOffset(page(), PAGE_SIZE),
			...(stateFilter() === "all" ? {} : { state: stateFilter() }),
			statusFilter: statusFilter(),
			sortBy: sortBy(),
			sortOrder: sortOrder(),
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
		setList(res.data);
		setListError(null);
	};

	const toggleSort = (field: TrackingVideoSortField) => {
		if (sortBy() === field) {
			setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortBy(field);
			setSortOrder("desc");
		}
		setPage(0);
		void loadList();
	};

	const runSearch = () => {
		setAppliedSearch(searchInput());
		setPage(0);
		void loadList();
	};

	onMount(() => {
		void loadList();
	});

	const renderSortIcon = (field: TrackingVideoSortField) => {
		if (sortBy() !== field) {
			return <ArrowUpDown class="w-3 h-3 text-tertiary opacity-40 group-hover:opacity-100" />;
		}
		return sortOrder() === "asc" ? (
			<ArrowUp class="w-3 h-3 text-primary" />
		) : (
			<ArrowDown class="w-3 h-3 text-primary" />
		);
	};

	const stateBadge = (state: string) => {
		switch (state) {
			case "new":
				return (
					<Badge variant="warning" size="sm" dot>
						{t("videos.state.new")}
					</Badge>
				);
			case "milestone":
				return (
					<Badge variant="neutral" size="sm" dot>
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
					<Badge variant="success" size="sm" dot>
						{t("videos.state.regular")}
					</Badge>
				);
		}
	};

	const total = () => list()?.total ?? 0;

	return (
		<div class="flex flex-col gap-6">
			{/* Top Operational Toolbar */}
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex items-center gap-2">
					<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
						{t("videos.title")}
					</span>
					<Show when={total() > 0}>
						<Badge variant="neutral" size="sm">
							{total()}
						</Badge>
					</Show>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<div class="w-44">
						<Select
							size="sm"
							options={statusOptions}
							value={statusFilter()}
							onValueChange={(val) => {
								if (
									val === "all" ||
									val === "failing" ||
									val === "highPriority" ||
									val === "normal"
								) {
									setStatusFilter(val);
									setPage(0);
									void loadList();
								}
							}}
						/>
					</div>

					<div class="w-36">
						<Select
							size="sm"
							options={stateOptions}
							value={stateFilter()}
							onValueChange={(val) => {
								if (
									val === "all" ||
									val === "new" ||
									val === "regular" ||
									val === "milestone" ||
									val === "archive"
								) {
									setStateFilter(val);
									setPage(0);
									void loadList();
								}
							}}
						/>
					</div>

					<div class="w-64 flex items-center gap-1.5">
						<div class="flex-1">
							<TextField
								size="sm"
								placeholder="按 AID / BVID / 标题精准查找..."
								value={searchInput()}
								onInput={(e) => setSearchInput(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") runSearch();
								}}
							/>
						</div>
						<Button
							size="sm"
							variant="filled"
							disabled={loadingList()}
							onClick={runSearch}
							class="px-2.5"
							title={t("common.search")}
						>
							<Search class="w-3.5 h-3.5" />
						</Button>
					</div>

					<Button
						size="sm"
						variant="outlined"
						loading={loadingList()}
						onClick={() => void loadList()}
						class="gap-1.5 shrink-0"
					>
						<RefreshCw class="w-3.5 h-3.5" />
						<span>{t("common.refresh")}</span>
					</Button>
				</div>
			</div>

			<Show when={listError() && list()}>
				<p role="alert" class="ts-caption text-error">
					{listError()}
				</p>
			</Show>

			{/* Main Video Tracking Table (Direct, no outer card wrap) */}
			<div class="border border-border bg-surface">
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
								<div class="cvsa-scroll overflow-x-auto">
									<table class="w-full text-left ts-caption">
										<thead>
											<tr class="border-b border-border text-tertiary bg-surface-container-high uppercase tracking-wider text-xs select-none">
												<th class="py-2.5 px-4 font-semibold">
													{t("videos.col.video")}
												</th>
												<th class="py-2.5 px-4 font-semibold whitespace-nowrap">
													{t("videos.col.state")}
												</th>
												<th
													class="py-2.5 px-4 font-semibold whitespace-nowrap cursor-pointer hover:text-primary transition-colors group"
													onClick={() => toggleSort("views")}
												>
													<div class="flex items-center gap-1.5">
														<span>{t("videos.col.views")}</span>
														{renderSortIcon("views")}
													</div>
												</th>
												<th
													class="py-2.5 px-4 font-semibold whitespace-nowrap cursor-pointer hover:text-primary transition-colors group"
													onClick={() => toggleSort("velocity")}
												>
													<div class="flex items-center gap-1.5">
														<span>{t("videos.col.velocity")}</span>
														{renderSortIcon("velocity")}
													</div>
												</th>
												<th
													class="py-2.5 px-4 font-semibold whitespace-nowrap cursor-pointer hover:text-primary transition-colors group"
													onClick={() => toggleSort("nextSnapshotAt")}
												>
													<div class="flex items-center gap-1.5">
														<span>{t("videos.col.nextSnapshot")}</span>
														{renderSortIcon("nextSnapshotAt")}
													</div>
												</th>
												<th
													class="py-2.5 px-4 font-semibold whitespace-nowrap cursor-pointer hover:text-primary transition-colors group"
													onClick={() => toggleSort("consecutiveFails")}
												>
													<div class="flex items-center gap-1.5">
														<span>失败数</span>
														{renderSortIcon("consecutiveFails")}
													</div>
												</th>
												<th class="py-2.5 px-4 font-semibold text-right whitespace-nowrap">
													{t("videos.col.action")}
												</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-border text-sm">
											<For each={current().items}>
												{(item) => (
													<tr class="hover:bg-hover transition-colors">
														<td class="py-3 px-4 min-w-60">
															<div class="flex flex-col items-start gap-1">
																<a
																	href={`/admin/crawler/video/${item.aid}`}
																	class="text-left font-medium text-primary hover:underline cursor-pointer"
																>
																	{item.title ||
																		`AID ${item.aid}`}
																</a>
																<div class="flex flex-wrap gap-x-2 text-tertiary text-xs">
																	<span>AID {item.aid}</span>
																	<Show when={item.bvid}>
																		{(bvid) => (
																			<a
																				href={`https://www.bilibili.com/video/${bvid()}`}
																				target="_blank"
																				rel="noopener noreferrer"
																				class="inline-flex items-center gap-1 text-secondary hover:underline"
																			>
																				{bvid()}
																				<ExternalLink class="w-3 h-3" />
																			</a>
																		)}
																	</Show>
																	<Show when={item.ownerName}>
																		<span>
																			{item.ownerName}
																		</span>
																	</Show>
																</div>
															</div>
														</td>
														<td class="py-3 px-4 whitespace-nowrap">
															{stateBadge(item.state)}
														</td>
														<td class="py-3 px-4 font-medium text-primary whitespace-nowrap">
															{item.lastViews !== null
																? formatMetric(item.lastViews)
																: "—"}
														</td>
														<td class="py-3 px-4 text-secondary whitespace-nowrap">
															{typeof item.velocity === "number"
																? `${item.velocity.toFixed(1)}/h`
																: "—"}
														</td>
														<td class="py-3 px-4 text-tertiary whitespace-nowrap text-xs">
															{formatDateTime(item.nextSnapshotAt)}
														</td>
														<td class="py-3 px-4 whitespace-nowrap text-xs">
															<Show
																when={item.consecutiveFails > 0}
																fallback={
																	<span class="text-tertiary">
																		0
																	</span>
																}
															>
																<Badge variant="danger" size="sm">
																	{item.consecutiveFails}
																</Badge>
															</Show>
														</td>
														<td class="py-3 px-4 text-right whitespace-nowrap">
															<a
																href={`/admin/crawler/video/${item.aid}`}
																class="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium border border-border bg-surface text-primary hover:bg-hover transition-colors"
															>
																<Eye class="w-3.5 h-3.5" />
																<span>
																	{t("videos.action.detail")}
																</span>
															</a>
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
								<span class="ts-caption text-tertiary text-xs">
									{formatPageLabel(page(), current().total, PAGE_SIZE)}
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
											!hasNextPage(page(), current().total, PAGE_SIZE) ||
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
			</div>
		</div>
	);
}
