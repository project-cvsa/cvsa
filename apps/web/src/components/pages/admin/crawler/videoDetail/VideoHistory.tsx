import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Pagination from "../TablePagination";
import { For, Show, type Accessor } from "solid-js";

import { getComponentT } from "@lib/i18n/isomorphic";
import type { VideoMetadataHistoryListResponse } from "@cvsa/contracts";
import { formatDateTime } from "../format";
import {
	filterDecisionMessageKey,
	metadataChangeMessageKey,
	metadataFieldMessageKey,
} from "../labels";
import { toMetadataFieldDiffs } from "../metadataHistory";
import { getPageOffset } from "../pagination";

type VideoHistoryProps = {
	history: Accessor<VideoMetadataHistoryListResponse | null>;
	historyTotal: Accessor<number>;
	historyPage: Accessor<number>;
	historyError: Accessor<string | null>;
	loadingHistory: Accessor<boolean>;
	loadHistoryPage: (offset: number) => Promise<void>;
	pageSize: number;
};

type HistoryItem = VideoMetadataHistoryListResponse["items"][number];
type FieldDiff = ReturnType<typeof toMetadataFieldDiffs>[number];

function HistoryEntry(props: { item: HistoryItem }) {
	const t = getComponentT("crawler");
	const fieldLabel = (field: string) => {
		const key = metadataFieldMessageKey(field);
		return key ? t(key) : field;
	};
	const valueLabel = (field: string, value: string) => {
		const key = field === "filterDecision" ? filterDecisionMessageKey(value) : null;
		return key ? t(key) : value;
	};
	const changeLabel = () => {
		const key = metadataChangeMessageKey(props.item.changeType);
		return key ? t(key) : props.item.changeType;
	};
	const columns: TableColumn<FieldDiff>[] = [
		{
			id: "field",
			header: t("videoDetail.field"),
			class: "text-secondary",
			cell: (diff) => fieldLabel(diff.field),
		},
		{
			id: "before",
			header: t("videoDetail.before"),
			class: "text-tertiary break-words",
			cell: (diff) => valueLabel(diff.field, diff.before),
		},
		{
			id: "after",
			header: t("videoDetail.after"),
			class: "text-primary break-words",
			cell: (diff) => valueLabel(diff.field, diff.after),
		},
	];
	return (
		<article class="flex flex-col gap-2">
			<div class="flex flex-wrap items-center gap-2">
				<span class="px-2 py-0.5 ts-caption font-medium bg-hover text-primary">
					{changeLabel()}
				</span>
				<span class="ts-caption text-tertiary">
					{formatDateTime(props.item.capturedAt)}
				</span>
			</div>
			<DataTable columns={columns} items={toMetadataFieldDiffs(props.item.changedFields)} />
		</article>
	);
}

export default function VideoHistory(props: VideoHistoryProps) {
	const t = getComponentT("crawler");
	return (
		<section class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="ts-label text-primary">{t("videoDetail.history")}</h3>
				<span class="ts-caption text-tertiary">
					{t("videoDetail.changes").replace("{count}", String(props.historyTotal()))}
				</span>
			</div>
			<Show when={props.historyError() && (props.history()?.items.length ?? 0) > 0}>
				<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
					{props.historyError()}
				</div>
			</Show>
			<Show
				when={(props.history()?.items.length ?? 0) > 0}
				fallback={
					<div class="ts-caption text-tertiary">
						{props.loadingHistory()
							? t("common.loading")
							: (props.historyError() ?? t("videoDetail.noChanges"))}
					</div>
				}
			>
				<div class="flex flex-col gap-3">
					<For each={props.history()?.items ?? []}>
						{(item) => <HistoryEntry item={item} />}
					</For>
				</div>
			</Show>
			<Show when={props.historyTotal() > props.pageSize}>
				<Pagination
					page={props.historyPage()}
					total={props.historyTotal()}
					pageSize={props.pageSize}
					busy={props.loadingHistory()}
					onPageChange={(page) =>
						void props.loadHistoryPage(getPageOffset(page, props.pageSize))
					}
				/>
			</Show>
		</section>
	);
}
