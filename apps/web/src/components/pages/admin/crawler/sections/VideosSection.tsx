import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import { api } from "@lib/api";
import type { TrackingVideoListItem, TrackingVideoListResponse } from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";
import { describeTrackingState } from "../labels";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";
import { createRequestSequence } from "../videoActions";
import VideoDetailPanel from "../videoDetail/VideoDetailPanel";

const PAGE_SIZE = 10;

type StateFilter = "all" | "new" | "regular" | "milestone" | "archive";

const STATE_FILTERS: ReadonlyArray<{ value: StateFilter; label: string }> = [
	{ value: "all", label: "All states" },
	{ value: "new", label: "New" },
	{ value: "regular", label: "Regular" },
	{ value: "milestone", label: "Milestone" },
	{ value: "archive", label: "Archive" },
];

export default function VideosSection() {
	const [stateFilter, setStateFilter] = createSignal<StateFilter>("all");
	const [searchInput, setSearchInput] = createSignal("");
	const [appliedSearch, setAppliedSearch] = createSignal("");
	const [page, setPage] = createSignal(0);
	const [list, setList] = createSignal<TrackingVideoListResponse | null>(null);
	const [loadingList, setLoadingList] = createSignal(false);
	const [listError, setListError] = createSignal<string | null>(null);
	const [detailAid, setDetailAid] = createSignal("");
	const [selected, setSelected] = createSignal<TrackingVideoListItem | null>(null);
	const listRequests = createRequestSequence();

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
			setListError(res.error.message || "Could not load videos");
			return;
		}
		if (!res.data) {
			setListError("No videos");
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

	const selectState = (next: StateFilter) => {
		setStateFilter(next);
		setPage(0);
		void loadList();
	};

	const inspect = (value: string, item?: TrackingVideoListItem) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		setSelected(item ?? null);
		setDetailAid(trimmed);
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

	const goToPage = (next: number) => {
		setPage(next);
		void loadList();
	};

	onMount(() => {
		void loadList();
	});

	const total = () => list()?.total ?? 0;

	return (
		<div class="flex flex-col gap-6">
			<div class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="ts-heading-2 text-primary">Videos</h2>
					<span class="ts-caption text-tertiary">{total()} tracked</span>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<label class="ts-label text-primary" for="crawler-video-state">
						State
					</label>
					<select
						id="crawler-video-state"
						class="h-10 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={stateFilter()}
						onChange={(event) => selectState(parseState(event.currentTarget.value))}
					>
						<For each={STATE_FILTERS}>
							{(option) => <option value={option.value}>{option.label}</option>}
						</For>
					</select>
					<label class="ts-label text-primary" for="crawler-video-search">
						Search
					</label>
					<input
						id="crawler-video-search"
						type="text"
						class="h-10 px-3 border border-border rounded text-primary bg-transparent w-60 text-sm"
						placeholder="AID, BVID or title"
						value={searchInput()}
						onInput={(event) => setSearchInput(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") runSearch();
						}}
					/>
					<Button size="sm" variant="filled" disabled={loadingList()} onClick={runSearch}>
						{loadingList() ? "Searching" : "Search"}
					</Button>
					<span class="ts-caption text-tertiary">Numeric AIDs open details</span>
				</div>
			</div>

			<Show
				when={list()}
				fallback={
					<div class="p-6 text-center text-tertiary border border-border rounded">
						{loadingList()
							? "Loading"
							: listError() !== null
								? listError()
								: "No videos"}
					</div>
				}
			>
				{(current) => (
					<div class="flex flex-col gap-3">
						<Show
							when={current().items.length > 0}
							fallback={
								<div class="p-6 text-center text-tertiary border border-border rounded">
									No matching videos
								</div>
							}
						>
							<div class="overflow-x-auto border border-border rounded">
								<table class="w-full text-left ts-caption">
									<thead>
										<tr class="border-b border-border text-tertiary">
											<th class="py-2 px-3">AID</th>
											<th class="py-2 px-3">Title</th>
											<th class="py-2 px-3">State</th>
											<th class="py-2 px-3">Views</th>
											<th class="py-2 px-3">Velocity</th>
											<th class="py-2 px-3">Next snapshot</th>
										</tr>
									</thead>
									<tbody>
										<For each={current().items}>
											{(item) => (
												<tr
													classList={{
														"bg-hover": detailAid() === item.aid,
													}}
													class="border-b border-border hover:bg-hover"
												>
													<td class="py-2 px-3">
														<button
															type="button"
															class="font-mono font-medium text-primary underline-offset-2 hover:underline"
															onClick={() => inspect(item.aid, item)}
														>
															{item.aid}
														</button>
													</td>
													<td class="py-2 px-3 text-secondary max-w-80 truncate">
														{item.title ?? "—"}
													</td>
													<td class="py-2 px-3">
														{describeTrackingState(item.state)}
													</td>
													<td class="py-2 px-3">
														{formatMetric(item.lastViews)}
													</td>
													<td class="py-2 px-3 text-tertiary">
														{formatMetric(item.velocity)}/h
													</td>
													<td class="py-2 px-3 text-tertiary">
														{formatDateTime(item.nextSnapshotAt)}
													</td>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
						</Show>

						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="ts-caption text-tertiary">
								{formatPageLabel(page(), current().total, PAGE_SIZE)}
							</span>
							<div class="flex gap-2">
								<Button
									size="sm"
									variant="outlined"
									disabled={loadingList() || page() === 0}
									onClick={() => goToPage(page() - 1)}
								>
									Previous
								</Button>
								<Button
									size="sm"
									variant="outlined"
									disabled={
										loadingList() ||
										!hasNextPage(page(), current().total, PAGE_SIZE)
									}
									onClick={() => goToPage(page() + 1)}
								>
									Next
								</Button>
							</div>
						</div>
					</div>
				)}
			</Show>

			<Show when={detailAid()}>
				<div class="border-t border-border pt-6">
					<VideoDetailPanel aid={detailAid} selected={selected} />
				</div>
			</Show>
		</div>
	);
}

function parseState(value: string): StateFilter {
	switch (value) {
		case "new":
		case "regular":
		case "milestone":
		case "archive":
			return value;
		default:
			return "all";
	}
}
