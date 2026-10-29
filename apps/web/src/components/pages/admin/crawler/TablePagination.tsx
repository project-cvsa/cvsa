import Button from "@components/ui/Button";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatPageLabel, hasNextPage } from "./pagination";

type PaginationProps = {
	page: number;
	total: number;
	pageSize: number;
	busy?: boolean;
	onPageChange: (page: number) => void;
};

export default function Pagination(props: PaginationProps) {
	const t = getComponentT("crawler");
	return (
		<footer class="flex items-center justify-between gap-3 ts-caption text-secondary">
			<span>{formatPageLabel(props.page, props.total, props.pageSize)}</span>
			<div class="flex gap-2">
				<Button
					size="sm"
					variant="outlined"
					disabled={props.page === 0 || props.busy}
					onClick={() => props.onPageChange(props.page - 1)}
				>
					{t("common.previous")}
				</Button>
				<Button
					size="sm"
					variant="outlined"
					disabled={!hasNextPage(props.page, props.total, props.pageSize) || props.busy}
					onClick={() => props.onPageChange(props.page + 1)}
				>
					{t("common.next")}
				</Button>
			</div>
		</footer>
	);
}
