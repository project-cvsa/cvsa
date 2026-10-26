/** Offset pagination helpers shared by the console's tables. */

/** Offset for a zero-based page index. */
export function getPageOffset(page: number, pageSize: number): number {
	const safePage = Math.max(0, Math.trunc(page));
	return safePage * pageSize;
}

/** Number of pages needed for `total` rows; always at least one. */
export function getPageCount(total: number, pageSize: number): number {
	if (pageSize <= 0) return 1;
	return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamp a page index to the range the current `total` allows. */
export function clampPage(page: number, total: number, pageSize: number): number {
	return Math.min(Math.max(0, Math.trunc(page)), getPageCount(total, pageSize) - 1);
}

/** True when there is a page after `page`. */
export function hasNextPage(page: number, total: number, pageSize: number): boolean {
	return page + 1 < getPageCount(total, pageSize);
}

/** Human page label, e.g. `2 / 5`. */
export function formatPageLabel(page: number, total: number, pageSize: number): string {
	return `${clampPage(page, total, pageSize) + 1} / ${getPageCount(total, pageSize)}`;
}
