import { For, Show, type Accessor } from "solid-js";
import Button from "@components/ui/Button";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { VideoMetadataHistoryListResponse } from "@cvsa/contracts";
import { formatDateTime } from "../format";
import { toMetadataFieldDiffs } from "../metadataHistory";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";

type VideoHistoryProps = {
	history: Accessor<VideoMetadataHistoryListResponse | null>;
	historyTotal: Accessor<number>;
	historyPage: Accessor<number>;
	historyError: Accessor<string | null>;
	loadingHistory: Accessor<boolean>;
	loadHistoryPage: (offset: number) => Promise<void>;
	changeLabel: (value: string) => string;
	fieldLabel: (value: string) => string;
	pageSize: number;
};

export default function VideoHistory(props: VideoHistoryProps) {
	const t = getComponentT("crawler");
	return (
		<div class="p-4 rounded border border-border flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h4 class="ts-caption font-semibold text-primary">{t("videoDetail.history")}</h4>
				<span class="ts-caption text-tertiary">
					{t("videoDetail.changes").replace("{count}", String(props.historyTotal()))}
				</span>
			</div>
			<Show when={props.historyError()}>
				{(error) => (
					<Show when={props.history()?.items.length}>
						<p role="alert" class="ts-caption text-error">
							{error()}
						</p>
					</Show>
				)}
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
						{(item) => (
							<div class="flex flex-col gap-2 border-b border-border pb-3">
								<div class="flex flex-wrap items-center gap-2">
									<span class="px-2 py-0.5 rounded ts-caption font-medium bg-hover border border-border text-primary">
										{props.changeLabel(item.changeType)}
									</span>
									<span class="ts-caption text-tertiary">
										{formatDateTime(item.capturedAt)}
									</span>
								</div>
								<div class="cvsa-scroll overflow-x-auto">
									<table class="w-full text-left ts-caption">
										<thead>
											<tr class="border-b border-border text-tertiary">
												<th class="py-1 px-2">{t("videoDetail.field")}</th>
												<th class="py-1 px-2">{t("videoDetail.before")}</th>
												<th class="py-1 px-2">{t("videoDetail.after")}</th>
											</tr>
										</thead>
										<tbody>
											<For each={toMetadataFieldDiffs(item.changedFields)}>
												{(diff) => (
													<tr class="border-b border-border">
														<td class="py-1 px-2 text-secondary">
															{props.fieldLabel(diff.field)}
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
			<Show when={props.historyTotal() > props.pageSize}>
				<div class="flex items-center justify-between gap-2 border-t border-border pt-3">
					<span class="ts-caption text-tertiary">
						{formatPageLabel(props.historyPage(), props.historyTotal(), props.pageSize)}
					</span>
					<div class="flex gap-2">
						<Button
							size="sm"
							variant="outlined"
							disabled={props.loadingHistory() || props.historyPage() === 0}
							onClick={() =>
								void props.loadHistoryPage(
									getPageOffset(props.historyPage() - 1, props.pageSize)
								)
							}
						>
							{t("videoDetail.previous")}
						</Button>
						<Button
							size="sm"
							variant="outlined"
							disabled={
								props.loadingHistory() ||
								!hasNextPage(
									props.historyPage(),
									props.historyTotal(),
									props.pageSize
								)
							}
							onClick={() =>
								void props.loadHistoryPage(
									getPageOffset(props.historyPage() + 1, props.pageSize)
								)
							}
						>
							{t("videoDetail.next")}
						</Button>
					</div>
				</div>
			</Show>
		</div>
	);
}
