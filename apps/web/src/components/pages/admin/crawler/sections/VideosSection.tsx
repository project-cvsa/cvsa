import StateBadge from "../StateBadge";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Pagination, { CompactPager } from "../TablePagination";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Select, { type SelectOption } from "@components/ui/Select";
import TextField from "@components/ui/TextField";
import { toast } from "@components/ui/Toast";
import { controlSizeClass } from "@components/ui/controlStyles";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { TrackingVideoListResponse, TrackingVideoSortField } from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";
import { getPageOffset } from "../pagination";
import { createRequestSequence } from "../videoActions";
import Search from "lucide-solid/icons/search";
import ExternalLink from "lucide-solid/icons/external-link";
import Eye from "lucide-solid/icons/eye";
import Trash2 from "lucide-solid/icons/trash-2";
import ArrowUpDown from "lucide-solid/icons/arrow-up-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";

const PAGE_SIZE = 15;

type StateFilter = "all" | "new" | "regular" | "milestone" | "archive";
type TrackingVideo = TrackingVideoListResponse["items"][number];
type StatusFilter = "all" | "failing" | "highPriority" | "normal";

function VideoIdentity(props: { item: TrackingVideo }) {
	return (
		<div class="flex items-center gap-3">
			<div class="w-16 h-10 shrink-0 bg-surface-container-high overflow-hidden flex items-center justify-center border border-border">
				<Show
					when={props.item.pic}
					fallback={<span class="ts-caption text-tertiary">无封面</span>}
				>
					{(pic) => (
						<img
							src={pic()}
							alt=""
							class="w-full h-full object-cover"
							loading="lazy"
							referrerPolicy="no-referrer"
							onError={(e) => {
								e.currentTarget.style.display = "none";
							}}
						/>
					)}
				</Show>
			</div>
			<div class="flex flex-col items-start gap-0.5 min-w-0">
				<a
					href={`/admin/crawler/video/${props.item.aid}`}
					class="w-full text-left font-medium text-primary hover:underline cursor-pointer truncate"
					title={props.item.title || `AID ${props.item.aid}`}
				>
					{props.item.title || `AID ${props.item.aid}`}
				</a>
				<div class="flex flex-wrap items-center gap-x-2 text-tertiary ts-caption">
					<span>av{props.item.aid}</span>
					<Show when={props.item.bvid}>
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
					<Show when={props.item.ownerName}>
						<span class="truncate max-w-36">{props.item.ownerName}</span>
					</Show>
					<Show when={props.item.publishedAt}>
						<span>· {formatDateTime(props.item.publishedAt)}</span>
					</Show>
				</div>
			</div>
		</div>
	);
}

export default function VideosSection() {
	const t = getComponentT("crawler");

	const [stateFilter, setStateFilter] = createSignal<StateFilter>("all");
	const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
	const [sortBy, setSortBy] = createSignal<TrackingVideoSortField>("updatedAt");
	const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("desc");
	const [searchInput, setSearchInput] = createSignal("");
	const [appliedSearch, setAppliedSearch] = createSignal("");
	const [page, setPage] = createSignal(0);
	const [pageSize, setPageSize] = createSignal(PAGE_SIZE);
	const [list, setList] = createSignal<TrackingVideoListResponse | null>(null);
	const [loadingList, setLoadingList] = createSignal(false);
	const [listError, setListError] = createSignal<string | null>(null);
	const [excludingAid, setExcludingAid] = createSignal<string | null>(null);
	const listRequests = createRequestSequence();

	const stateOptions: SelectOption[] = [
		{ value: "all", label: `${t("videos.state.all")}` },
		{ value: "new", label: t("videos.state.new") },
		{ value: "regular", label: t("videos.state.regular") },
		{ value: "milestone", label: t("videos.state.milestone") },
		{ value: "archive", label: t("videos.state.archive") },
	];

	const statusOptions: SelectOption[] = [
		{ value: "all", label: t("audit.videoHealth.all") },
		{ value: "failing", label: t("audit.videoHealth.failing") },
		{ value: "highPriority", label: t("audit.videoHealth.highPriority") },
		{ value: "normal", label: t("audit.videoHealth.normal") },
	];

	const loadList = async () => {
		const request = listRequests.start();
		setLoadingList(true);
		const res = await api.crawler.listTrackingVideos({
			limit: pageSize(),
			offset: getPageOffset(page(), pageSize()),
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

	const handleExclude = async (aid: string) => {
		if (excludingAid()) return;
		setExcludingAid(aid);

		// Optimistic removal
		const prev = list();
		const removedItem = prev?.items.find((item) => item.aid === aid);
		setList((current) => {
			if (!current) return current;
			return {
				...current,
				items: current.items.filter((item) => item.aid !== aid),
				total: Math.max(0, current.total - 1),
			};
		});

		const res = await api.crawler.deleteTracking(aid);
		setExcludingAid(null);
		if (res.ok) {
			toast.success(t("videos.excluded"), {
				duration: 8000,
				action: {
					label: t("common.undo"),
					onClick: async () => {
						const sampleRes = await api.crawler.labelDiscoverySample(aid, 1);
						const restoreSuccess =
							sampleRes.ok ||
							(await api.crawler.registerTracking({ aids: [aid], state: "regular" }))
								.ok;
						if (restoreSuccess) {
							if (removedItem) {
								setList((current) => {
									if (!current) return current;
									return {
										...current,
										items: [removedItem, ...current.items],
										total: current.total + 1,
									};
								});
							} else {
								void loadList();
							}
							toast.success(t("videos.undoSuccess"));
						} else {
							toast.error(sampleRes.error?.message || t("common.error"));
						}
					},
				},
			});
		} else {
			setList(prev);
			toast.error(res.error.message || t("common.error"));
		}
	};

	useCrawlerRefresh("videos", () => {
		if (!loadingList()) void loadList();
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

	const total = () => list()?.total ?? 0;

	const sortHeader = (label: string, field: TrackingVideoSortField) => (
		<button
			type="button"
			class="inline-flex items-center gap-1.5 group hover:text-primary"
			onClick={() => toggleSort(field)}
		>
			{label}
			{renderSortIcon(field)}
		</button>
	);

	const columns: TableColumn<TrackingVideo>[] = [
		{
			id: "video",
			header: t("videos.col.video"),
			class: "max-w-128",
			cell: (item) => <VideoIdentity item={item} />,
		},
		{
			id: "discovery",
			header: t("audit.source"),
			class: "whitespace-nowrap",
			cell: (item) => (
				<div class="flex flex-col gap-0.5 ts-caption">
					<span class="text-primary font-medium">
						{item.discoverySource ? t(`audit.sources.${item.discoverySource}`) : "—"}
					</span>
					<Show when={item.filterDecision}>
						<span class="text-tertiary">
							{item.filterDecision === "accepted"
								? t("discoveryUi.whitelist")
								: item.filterDecision}
						</span>
					</Show>
				</div>
			),
		},
		{
			id: "state",
			header: t("videos.col.state"),
			class: "whitespace-nowrap",
			cell: (item) => <StateBadge kind="tracking" state={item.state} />,
		},
		{
			id: "views",
			header: sortHeader(t("videos.col.views"), "views"),
			class: "whitespace-nowrap",
			cell: (item) => (
				<div class="flex flex-col ts-caption">
					<span class="text-primary font-medium">
						{item.lastViews === null ? "—" : formatMetric(item.lastViews)}
					</span>
					<span class="text-tertiary">
						{typeof item.velocity === "number" ? `${item.velocity.toFixed(1)}/h` : "—"}
					</span>
				</div>
			),
		},
		{
			id: "next",
			header: sortHeader(t("videos.col.nextSnapshot"), "nextSnapshotAt"),
			class: "whitespace-nowrap text-tertiary ts-caption",
			cell: (item) => (
				<div class="flex flex-col gap-0.5">
					<span>{formatDateTime(item.nextSnapshotAt)}</span>
					<Show
						when={
							item.consecutiveFails > 0 ||
							(item.videoStatus && item.videoStatus !== "normal")
						}
					>
						<span title={item.lastError ?? undefined}>
							<Badge variant="danger" size="sm">
								{item.videoStatus && item.videoStatus !== "normal"
									? item.videoStatus
									: `${item.consecutiveFails} fails`}
							</Badge>
						</span>
					</Show>
				</div>
			),
		},
		{
			id: "action",
			header: t("videos.col.action"),
			class: "text-right whitespace-nowrap min-w-44",
			cell: (item) => (
				<div class="inline-flex items-center gap-2">
					<a
						href={`/admin/crawler/video/${item.aid}`}
						class={`inline-flex items-center gap-1 px-2.5 ${controlSizeClass("sm")} font-medium border border-border bg-surface text-primary hover:bg-hover transition-colors`}
						title={t("videos.action.detail")}
					>
						<Eye class="w-3.5 h-3.5" />
						<span>{t("videos.action.detail")}</span>
					</a>
					<Button
						variant="outlined"
						size="sm"
						class="text-error border-error/50 hover:bg-error hover:text-on-error hover:border-error px-2.5"
						disabled={excludingAid() === item.aid}
						onClick={() => void handleExclude(item.aid)}
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>{t("videos.action.exclude")}</span>
					</Button>
				</div>
			),
		},
	];

	const emptyLabel = () => {
		if (loadingList()) return t("common.loading");
		if (listError()) return listError();
		return t("videos.empty");
	};

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader
				title={
					<>
						<h2 class="ts-heading-2">{t("videos.title")}</h2>
						<Badge size="sm" variant="neutral">
							{total()}
						</Badge>
					</>
				}
				actions={
					<CompactPager
						page={page()}
						total={total()}
						pageSize={pageSize()}
						busy={loadingList()}
						onPageChange={(next) => {
							setPage(next);
							void loadList();
						}}
					/>
				}
			/>
			<div class="flex flex-wrap items-center gap-2 w-full">
				<div class="w-44 shrink-0">
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

				<div class="w-36 shrink-0">
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

				<div class="flex-1 min-w-[280px] flex items-center gap-1.5">
					<div class="flex-1 min-w-0">
						<TextField
							class="w-full"
							size="sm"
							placeholder={t("audit.search")}
							aria-label={t("audit.search")}
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
						class="px-3 shrink-0"
						title={t("common.search")}
					>
						<Search class="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<Show when={listError() && list()}>
				<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
					{listError()}
				</div>
			</Show>

			<DataTable
				columns={columns}
				items={list()?.items ?? []}
				busy={loadingList()}
				empty={emptyLabel()}
			/>
			<Pagination
				page={page()}
				total={total()}
				pageSize={pageSize()}
				pageSizeOptions={[10, 15, 25, 50, 100]}
				busy={loadingList()}
				onPageChange={(next) => {
					setPage(next);
					void loadList();
				}}
				onPageSizeChange={(nextSize) => {
					setPageSize(nextSize);
					setPage(0);
					void loadList();
				}}
			/>
		</div>
	);
}
