import clsx from "clsx";
import { createEffect, createSignal, For, Show, on, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { LucideIcon } from "lucide-solid";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Ellipsis from "lucide-solid/icons/ellipsis";
import Menu, { type MenuItem } from "./Menu";

export interface ListAction {
	value: string;
	label: string;
	icon?: LucideIcon;
	disabled?: boolean;
	separatorBefore?: boolean;
}

export interface ListItem {
	id: string;
	title: string;
	description?: string;
	metadata?: string;
	avatarUrl?: string;
	icon?: LucideIcon;
	disabled?: boolean;
	actions?: readonly ListAction[];
}

export interface ListProps {
	class?: string;
	items: readonly ListItem[];
	ariaLabel: string;
	reorderable?: boolean;
	dragLabel?: (item: ListItem) => string;
	actionLabel?: (item: ListItem) => string;
	onReorder?: (items: readonly ListItem[]) => void;
	onSelect?: (item: ListItem) => void;
	onAction?: (item: ListItem, action: string) => void;
}

function moveItem(items: readonly ListItem[], from: number, to: number): ListItem[] {
	if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
		return [...items];
	}
	const next = [...items];
	const removed = next.splice(from, 1)[0];
	if (!removed) return next;
	next.splice(to, 0, removed);
	return next;
}

/** Layout snapshot of one row, taken when a drag starts and kept stable while it runs. */
interface DragMetric {
	id: string;
	index: number;
	top: number;
	height: number;
}

export default function List(props: ListProps) {
	let listRef: HTMLOListElement | undefined;
	const [orderedItems, setOrderedItems] = createSignal<ListItem[]>([...props.items]);
	const [draggedId, setDraggedId] = createSignal<string>();
	const [dragOffset, setDragOffset] = createSignal(0);
	const [dragShifts, setDragShifts] = createSignal<Record<string, number>>({});
	const [dragTarget, setDragTarget] = createSignal(-1);
	let pointerId: number | undefined;
	let pointerGrabOffset = 0;
	let dragOrigin = -1;
	let draggedHeight = 0;
	let draggedTop = 0;
	let dragMetrics: DragMetric[] = [];

	createEffect(
		on(
			() => props.items,
			(items) => {
				if (!draggedId()) setOrderedItems([...items]);
			}
		)
	);

	const animations = new Map<HTMLElement, Animation>();
	const animateOrder = (next: ListItem[]) => {
		const rows = Array.from(
			listRef?.querySelectorAll<HTMLElement>("[data-list-item-id]") ?? []
		);
		const positions = new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));
		for (const animation of animations.values()) animation.cancel();
		animations.clear();
		setOrderedItems(next);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		for (const row of rows) {
			if (row.dataset.listItemId === draggedId()) continue;
			const distance =
				(positions.get(row) ?? row.getBoundingClientRect().top) -
				row.getBoundingClientRect().top;
			if (!distance) continue;
			animations.set(
				row,
				row.animate(
					[{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }],
					// `fill: "backwards"` keeps the first keyframe through the one frame a fresh
					// WAAPI animation spends pending; without it that frame paints the row at
					// its destination first, which reads as a flash.
					{ duration: 200, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }
				)
			);
		}
	};
	onCleanup(() => {
		for (const animation of animations.values()) animation.cancel();
	});
	const commitMove = (from: number, to: number) => {
		if (from === to) return;
		const next = moveItem(orderedItems(), from, to);
		animateOrder(next);
		props.onReorder?.(next);
	};

	const moveByKeyboard = (item: ListItem, direction: "first" | "last" | "next" | "previous") => {
		const items = orderedItems();
		const from = items.findIndex((candidate) => candidate.id === item.id);
		if (from < 0) return;
		const to =
			direction === "first"
				? 0
				: direction === "last"
					? items.length - 1
					: clampIndex(from + (direction === "next" ? 1 : -1), items.length);
		commitMove(from, to);
	};

	const measureRows = (): DragMetric[] => {
		const rows = Array.from(
			listRef?.querySelectorAll<HTMLElement>("[data-list-item-id]") ?? []
		);
		return rows.map((row, index) => {
			const top = row.offsetTop;
			const height = row.offsetHeight;
			return {
				id: row.dataset.listItemId ?? "",
				index,
				top,
				height,
			};
		});
	};

	/**
	 * Index the dragged row drops into: a neighbour yields its slot as soon as the dragged
	 * row's center crosses the boundary line the two share.
	 */
	const resolveTarget = (virtualCenter: number): number => {
		let target = dragOrigin;
		for (const metric of dragMetrics) {
			if (metric.index === dragOrigin) continue;
			if (metric.index < dragOrigin) {
				if (virtualCenter < metric.top + metric.height) {
					target = Math.min(target, metric.index);
				}
			} else if (virtualCenter > metric.top) {
				target = Math.max(target, metric.index);
			}
		}
		return target;
	};

	/**
	 * Slots the rows between the dragged row and `target` hand over. Each one moves a whole
	 * slot — a fixed destination, never a fraction of the pointer's travel — and the row's
	 * transition animates it there.
	 */
	const shiftFor = (target: number): Record<string, number> => {
		const shifts: Record<string, number> = {};
		if (target === dragOrigin) return shifts;
		const upwards = target < dragOrigin;
		const first = upwards ? target : dragOrigin + 1;
		const last = upwards ? dragOrigin - 1 : target;
		for (const metric of dragMetrics) {
			if (metric.index < first || metric.index > last) continue;
			const slot = dragMetrics[upwards ? metric.index + 1 : metric.index - 1];
			if (!slot) continue;
			const shift = slot.top - metric.top;
			if (shift) shifts[metric.id] = shift;
		}
		return shifts;
	};

	const resetDrag = () => {
		pointerId = undefined;
		pointerGrabOffset = 0;
		dragOrigin = -1;
		draggedHeight = 0;
		draggedTop = 0;
		dragMetrics = [];
		setDragTarget(-1);
		setDragOffset(0);
		setDragShifts({});
		setDraggedId(undefined);
	};

	const startDrag = (
		event: PointerEvent & { currentTarget: HTMLButtonElement },
		item: ListItem
	) => {
		if (event.button !== 0 || item.disabled || !listRef) return;
		// A settle from the previous drop may still be running, and a live animation wins
		// over inline transforms — drop it before this drag starts writing its own.
		for (const animation of animations.values()) animation.cancel();
		animations.clear();
		const metrics = measureRows();
		const active = metrics.find((metric) => metric.id === item.id);
		if (!active) return;
		pointerId = event.pointerId;
		pointerGrabOffset = event.clientY - listRef.getBoundingClientRect().top - active.top;
		dragOrigin = active.index;
		setDragTarget(active.index);
		draggedHeight = active.height;
		draggedTop = active.top;
		dragMetrics = metrics;
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragOffset(0);
		setDragShifts({});
		setDraggedId(item.id);
	};

	/**
	 * The dragged row follows the pointer; the rows it displaces switch to a fixed
	 * destination the moment the boundary is crossed, and their own transition carries them
	 * there. Nothing here animates or measures, so nothing can jump or flash.
	 */
	const continueDrag = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
		const activeId = draggedId();
		if (!activeId || pointerId !== event.pointerId || !listRef || dragOrigin < 0) return;
		event.preventDefault();
		const listTop = listRef.getBoundingClientRect().top;
		const virtualTop = event.clientY - pointerGrabOffset - listTop;
		setDragOffset(virtualTop - draggedTop);
		const target = resolveTarget(virtualTop + draggedHeight / 2);
		if (target === dragTarget()) return;
		setDragTarget(target);
		setDragShifts(shiftFor(target));
	};

	/**
	 * Resolves the pointer-driven offsets into the committed order with a short FLIP,
	 * so releasing a drag never snaps a half-shifted row into place.
	 */
	const settleOrder = (next: ListItem[]) => {
		const rows = Array.from(
			listRef?.querySelectorAll<HTMLElement>("[data-list-item-id]") ?? []
		);
		const positions = new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));
		setOrderedItems(next);
		resetDrag();
		for (const animation of animations.values()) animation.cancel();
		animations.clear();
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		for (const row of rows) {
			const distance =
				(positions.get(row) ?? row.getBoundingClientRect().top) -
				row.getBoundingClientRect().top;
			if (!distance) continue;
			animations.set(
				row,
				row.animate(
					[{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }],
					{ duration: 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }
				)
			);
		}
	};

	const finishDrag = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
		if (pointerId !== event.pointerId) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		const from = dragOrigin;
		const target = dragTarget();
		if (from < 0) {
			resetDrag();
			return;
		}
		const next = from === target ? orderedItems() : moveItem(orderedItems(), from, target);
		settleOrder(next);
		if (from !== target) props.onReorder?.(next);
	};

	const cancelDrag = () => {
		if (dragOrigin < 0) return;
		settleOrder(orderedItems());
	};

	const itemTransform = (id: string): string | undefined => {
		if (draggedId() === id) return `translateY(${dragOffset()}px)`;
		const shift = dragShifts()[id];
		if (!shift) return undefined;
		return `translateY(${shift}px)`;
	};

	return (
		<ol
			ref={listRef}
			class={clsx("relative m-0 flex list-none flex-col p-0", props.class)}
			aria-label={props.ariaLabel}
		>
			<For each={orderedItems()}>
				{(item) => {
					const menuItems = (): MenuItem[] =>
						(item.actions ?? []).map((action) => ({
							value: action.value,
							label: action.label,
							icon: action.icon,
							disabled: action.disabled,
							separatorBefore: action.separatorBefore,
						}));

					return (
						<li
							data-list-item-id={item.id}
							style={{ transform: itemTransform(item.id) }}
							class={clsx(
								"group relative flex min-h-18 items-stretch bg-surface",
								item.disabled && "opacity-50",
								draggedId() === item.id &&
									"z-1 bg-surface-container-high opacity-90 shadow-md",
								// While a drag runs, every row except the one under the pointer
								// slides to the slot it is giving up over a fixed duration. The
								// row under the pointer keeps tracking the hand, so its
								// transition must never cover transform. Exactly one of these
								// two classes applies, because both set transition-property.
								draggedId() !== undefined && draggedId() !== item.id
									? "transition-[opacity,background-color,transform] duration-200 ease-out"
									: "transition-[opacity,background-color]"
							)}
						>
							<Show when={props.reorderable}>
								<button
									type="button"
									class="flex w-12 shrink-0 touch-none cursor-grab items-center justify-center text-quaternary outline-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary disabled:cursor-not-allowed"
									disabled={item.disabled}
									aria-label={props.dragLabel?.(item) ?? item.title}
									aria-roledescription="sortable"
									aria-keyshortcuts="ArrowUp ArrowDown Home End"
									onpointerdown={(event) => startDrag(event, item)}
									onpointermove={continueDrag}
									onpointerup={finishDrag}
									onpointercancel={cancelDrag}
									onkeydown={(event) => {
										if (event.key === "ArrowUp") {
											event.preventDefault();
											moveByKeyboard(item, "previous");
										}
										if (event.key === "ArrowDown") {
											event.preventDefault();
											moveByKeyboard(item, "next");
										}
										if (event.key === "Home") {
											event.preventDefault();
											moveByKeyboard(item, "first");
										}
										if (event.key === "End") {
											event.preventDefault();
											moveByKeyboard(item, "last");
										}
									}}
								>
									<GripVertical size={20} />
								</button>
							</Show>

							<ListItemContent item={item} onSelect={props.onSelect} />

							<Show when={menuItems().length > 0}>
								<div class="flex w-13 shrink-0 items-center justify-center">
									<Menu
										iconOnly
										triggerIcon={Ellipsis}
										label={props.actionLabel?.(item) ?? item.title}
										items={menuItems()}
										disabled={item.disabled}
										placement="bottom-end"
										onSelect={(action) => props.onAction?.(item, action)}
									/>
								</div>
							</Show>

							<span class="sr-only" aria-live="polite">
								{draggedId() === item.id
									? `${dragTarget() + 1} / ${orderedItems().length}`
									: ""}
							</span>
						</li>
					);
				}}
			</For>
		</ol>
	);
}

function clampIndex(index: number, length: number): number {
	return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

export function ListItemContent(props: { item: ListItem; onSelect?: (item: ListItem) => void }) {
	const content = () => (
		<>
			<Show when={props.item.avatarUrl || props.item.icon}>
				<span class="flex h-11 w-11 shrink-0 items-center justify-center bg-surface-container-medium text-quaternary">
					<Show
						when={props.item.avatarUrl}
						fallback={
							<Show when={props.item.icon}>
								{(icon) => <Dynamic component={icon()} size={20} />}
							</Show>
						}
					>
						{(avatarUrl) => (
							<img class="h-11 w-11 object-cover" src={avatarUrl()} alt="" />
						)}
					</Show>
				</span>
			</Show>

			<div class="min-w-0 flex-1">
				<div class="flex min-w-0 items-baseline justify-between gap-3">
					<span class="truncate ts-label text-primary">{props.item.title}</span>
					<Show when={props.item.metadata}>
						{(metadata) => (
							<span class="shrink-0 ts-caption text-quaternary">{metadata()}</span>
						)}
					</Show>
				</div>
				<Show when={props.item.description}>
					{(description) => (
						<p class="mt-0.5 line-clamp-2 ts-caption text-tertiary">{description()}</p>
					)}
				</Show>
			</div>
		</>
	);
	const className = "flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left";
	return (
		<Show when={props.onSelect} fallback={<div class={className}>{content()}</div>}>
			<button
				type="button"
				disabled={props.item.disabled}
				class={clsx(
					className,
					"bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-primary"
				)}
				onclick={() => props.onSelect?.(props.item)}
			>
				{content()}
			</button>
		</Show>
	);
}
