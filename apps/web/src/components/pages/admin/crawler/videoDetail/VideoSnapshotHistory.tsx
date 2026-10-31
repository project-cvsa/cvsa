import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Pagination from "../TablePagination";
import { Show, type Accessor } from "solid-js";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { VideoSnapshotItem, VideoSnapshotListResponse } from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";
import { getPageOffset } from "../pagination";

type VideoSnapshotHistoryProps = {
	snapshots: Accessor<VideoSnapshotListResponse | null>;
	snapshotsTotal: Accessor<number>;
	snapshotsPage: Accessor<number>;
	snapshotsError: Accessor<string | null>;
	loadingSnapshots: Accessor<boolean>;
	loadSnapshotsPage: (offset: number) => Promise<void>;
	pageSize: number;
};

export default function VideoSnapshotHistory(props: VideoSnapshotHistoryProps) {
	const t = getComponentT("crawler");

	const columns: TableColumn<VideoSnapshotItem>[] = [
		{
			id: "capturedAt",
			header: t("videoDetail.captured"),
			class: "text-secondary whitespace-nowrap",
			cell: (item) => formatDateTime(item.capturedAt),
		},
		{
			id: "views",
			header: t("videoDetail.views"),
			class: "text-primary font-medium",
			cell: (item) => formatMetric(item.views),
		},
		{
			id: "likes",
			header: t("videoDetail.likes"),
			class: "text-secondary",
			cell: (item) => formatMetric(item.likes),
		},
		{
			id: "coins",
			header: t("videoDetail.coins"),
			class: "text-secondary",
			cell: (item) => formatMetric(item.coins),
		},
		{
			id: "favorites",
			header: t("videoDetail.favorites"),
			class: "text-secondary",
			cell: (item) => formatMetric(item.favorites),
		},
		{
			id: "shares",
			header: t("videoDetail.shares"),
			class: "text-secondary",
			cell: (item) => formatMetric(item.shares),
		},
		{
			id: "danmakus",
			header: t("videoDetail.danmakus"),
			class: "text-secondary",
			cell: (item) => formatMetric(item.danmakus),
		},
		{
			id: "replies",
			header: t("videoDetail.replies"),
			class: "text-secondary",
			cell: (item) => formatMetric(item.replies),
		},
	];

	return (
		<section class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="ts-label text-primary">{t("videoDetail.snapshots")}</h3>
				<span class="ts-caption text-tertiary">
					{t("videoDetail.snapshotsCount").replace(
						"{count}",
						String(props.snapshotsTotal())
					)}
				</span>
			</div>
			<Show when={props.snapshotsError() && (props.snapshots()?.items.length ?? 0) > 0}>
				<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
					{props.snapshotsError()}
				</div>
			</Show>
			<Show
				when={(props.snapshots()?.items.length ?? 0) > 0}
				fallback={
					<div class="ts-caption text-tertiary">
						{props.loadingSnapshots()
							? t("common.loading")
							: (props.snapshotsError() ?? t("videoDetail.noSnapshots"))}
					</div>
				}
			>
				<DataTable columns={columns} items={props.snapshots()?.items ?? []} />
			</Show>
			<Show when={props.snapshotsTotal() > props.pageSize}>
				<Pagination
					page={props.snapshotsPage()}
					total={props.snapshotsTotal()}
					pageSize={props.pageSize}
					busy={props.loadingSnapshots()}
					onPageChange={(page) =>
						void props.loadSnapshotsPage(getPageOffset(page, props.pageSize))
					}
				/>
			</Show>
		</section>
	);
}
