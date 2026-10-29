import StateBadge from "../StateBadge";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Pagination from "../TablePagination";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Select, { type SelectOption } from "@components/ui/Select";
import TextField from "@components/ui/TextField";
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
import ArrowUpDown from "lucide-solid/icons/arrow-up-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";

const PAGE_SIZE = 10;

type StateFilter = "all" | "new" | "regular" | "milestone" | "archive";
type TrackingVideo = TrackingVideoListResponse["items"][number];

type StatusFilter = "all" | "failing" | "highPriority" | "normal";

function VideoIdentity(props: { item: TrackingVideo }) {
	return (
		<div class="flex flex-col items-start gap-1">
			<a
				href={`/admin/crawler/video/${props.item.aid}`}
				class="text-left font-medium text-primary hover:underline cursor-pointer"
			>
				{props.item.title || `AID ${props.item.aid}`}
			</a>
			<div class="flex flex-wrap gap-x-2 text-tertiary ts-caption">
				<span>AID {props.item.aid}</span>
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
					<span>{props.item.ownerName}</span>
				</Show>
			</div>
		</div>
	);
}

export default function VideosSection() {
	const t = getComponentT("crawler");
	const deepLinkSearch =
		new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get(
			"search"
		) ?? "";

	const [stateFilter, setStateFilter] = createSignal<StateFilter>("all");
	const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
	const [sortBy, setSortBy] = createSignal<TrackingVideoSortField>("updatedAt");
	const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("desc");
	const [searchInput, setSearchInput] = createSignal(deepLinkSearch);
	const [appliedSearch, setAppliedSearch] = createSignal(deepLinkSearch);
	const [page, setPage] = createSignal(0);
	const [list, setList] = createSignal<TrackingVideoListResponse | null>(null);
	const [loadingList, setLoadingList] = createSignal(false);
	const [listError, setListError] = createSignal<string | null>(null);
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
			class: "min-w-60",
			cell: (item) => <VideoIdentity item={item} />,
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
			cell: (item) => (item.lastViews === null ? "—" : formatMetric(item.lastViews)),
		},
		{
			id: "velocity",
			header: sortHeader(t("videos.col.velocity"), "velocity"),
			class: "whitespace-nowrap text-secondary",
			cell: (item) =>
				typeof item.velocity === "number" ? `${item.velocity.toFixed(1)}/h` : "—",
		},
		{
			id: "next",
			header: sortHeader(t("videos.col.nextSnapshot"), "nextSnapshotAt"),
			class: "whitespace-nowrap text-tertiary",
			cell: (item) => formatDateTime(item.nextSnapshotAt),
		},
		{
			id: "fails",
			header: sortHeader(t("audit.videoSort.consecutiveFails"), "consecutiveFails"),
			class: "whitespace-nowrap",
			cell: (item) => (
				<Show
					when={item.consecutiveFails > 0}
					fallback={<span class="text-tertiary">0</span>}
				>
					<Badge variant="danger" size="sm">
						{item.consecutiveFails}
					</Badge>
				</Show>
			),
		},
		{
			id: "action",
			header: t("videos.col.action"),
			class: "text-right whitespace-nowrap",
			cell: (item) => (
				<a
					href={`/admin/crawler/video/${item.aid}`}
					class={`inline-flex items-center gap-1.5 px-3 ${controlSizeClass("sm")} font-medium border border-border bg-surface text-primary hover:bg-hover transition-colors`}
				>
					<Eye class="w-3.5 h-3.5" />
					{t("videos.action.detail")}
				</a>
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
			/>
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
						class="px-2.5"
						title={t("common.search")}
					>
						<Search class="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			<Show when={listError() && list()}>
				<p role="alert" class="ts-caption text-error">
					{listError()}
				</p>
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
				pageSize={PAGE_SIZE}
				busy={loadingList()}
				onPageChange={(next) => {
					setPage(next);
					void loadList();
				}}
			/>
		</div>
	);
}
