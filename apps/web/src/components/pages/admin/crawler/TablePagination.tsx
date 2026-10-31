import { Show } from "solid-js";
import Button from "@components/ui/Button";
import Select from "@components/ui/Select";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatPageLabel, hasNextPage } from "./pagination";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";

export function CompactPager(props: {
	page: number;
	total: number;
	pageSize: number;
	busy?: boolean;
	onPageChange: (page: number) => void;
}) {
	const totalPages = () => Math.max(1, Math.ceil(props.total / props.pageSize));
	const currentPage = () => props.page + 1;

	return (
		<div class="inline-flex items-center gap-1 border border-border bg-surface px-1 py-0.5 select-none ts-caption">
			<Button
				size="sm"
				variant="ghost"
				class="h-6 w-6 p-0"
				disabled={props.page === 0 || props.busy}
				onClick={() => props.onPageChange(props.page - 1)}
				aria-label="Previous Page"
			>
				<ChevronLeft class="w-3.5 h-3.5" />
			</Button>
			<span class="px-2 font-medium text-primary tabular-nums">
				{currentPage()} / {totalPages()}
			</span>
			<Button
				size="sm"
				variant="ghost"
				class="h-6 w-6 p-0"
				disabled={!hasNextPage(props.page, props.total, props.pageSize) || props.busy}
				onClick={() => props.onPageChange(props.page + 1)}
				aria-label="Next Page"
			>
				<ChevronRight class="w-3.5 h-3.5" />
			</Button>
		</div>
	);
}

type PaginationProps = {
	page: number;
	total: number;
	pageSize: number;
	pageSizeOptions?: number[];
	busy?: boolean;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (pageSize: number) => void;
};

export default function Pagination(props: PaginationProps) {
	const t = getComponentT("crawler");
	const totalPages = () => Math.max(1, Math.ceil(props.total / props.pageSize));
	const currentPage = () => props.page + 1;

	return (
		<footer class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border ts-caption text-secondary">
			<div class="flex items-center gap-3">
				<span>{formatPageLabel(props.page, props.total, props.pageSize)}</span>
				<Show when={props.pageSizeOptions && props.onPageSizeChange}>
					<div class="w-28">
						<Select
							size="sm"
							value={String(props.pageSize)}
							options={
								props.pageSizeOptions?.map((size) => ({
									value: String(size),
									label: `${size} 条/页`,
								})) ?? []
							}
							onValueChange={(val) => {
								if (val) props.onPageSizeChange?.(Number(val));
							}}
						/>
					</div>
				</Show>
			</div>

			<div class="flex items-center gap-2">
				<Button
					size="sm"
					variant="outlined"
					class="px-2.5 h-8 gap-1"
					disabled={props.page === 0 || props.busy}
					onClick={() => props.onPageChange(props.page - 1)}
				>
					<ChevronLeft class="w-3.5 h-3.5" />
					<span>{t("common.previous")}</span>
				</Button>

				<span class="px-2 font-medium text-primary tabular-nums">
					{currentPage()} / {totalPages()}
				</span>

				<Button
					size="sm"
					variant="outlined"
					class="px-2.5 h-8 gap-1"
					disabled={!hasNextPage(props.page, props.total, props.pageSize) || props.busy}
					onClick={() => props.onPageChange(props.page + 1)}
				>
					<span>{t("common.next")}</span>
					<ChevronRight class="w-3.5 h-3.5" />
				</Button>
			</div>
		</footer>
	);
}
