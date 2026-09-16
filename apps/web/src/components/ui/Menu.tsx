import { Menu as ArkMenu } from "@ark-ui/solid/menu";
import clsx from "clsx";
import { type ComponentProps, For, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import type { LucideIcon } from "lucide-solid";
import ChevronDown from "lucide-solid/icons/chevron-down";

export type MenuSize = "sm" | "md" | "lg";

export interface MenuItem {
	value: string;
	label: string;
	icon?: LucideIcon;
	shortcut?: string;
	disabled?: boolean;
	separatorBefore?: boolean;
}

export interface MenuProps extends Omit<ComponentProps<"div">, "children" | "onSelect"> {
	label: string;
	items: readonly MenuItem[];
	size?: MenuSize;
	disabled?: boolean;
	onSelect?: (value: string) => void;
}

const triggerSizeClass: Record<MenuSize, string> = {
	sm: "h-8 px-3 ts-caption",
	md: "h-11 px-4 ts-label",
	lg: "h-14 px-5 ts-body",
};

const triggerBaseClass = clsx(
	"group inline-flex items-center justify-between gap-3",
	"border border-border bg-surface text-primary transition-colors",
	"hover:border-tertiary hover:bg-surface-container-medium",
	"focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
	"disabled:cursor-not-allowed disabled:opacity-50"
);

const contentClass = clsx("min-w-52 border-0 bg-surface p-1 select-none", "shadow-md outline-none");

const itemClass = clsx(
	"group grid min-h-10 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2",
	"px-3 text-left text-primary outline-none transition-colors",
	"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
	"data-[highlighted]:bg-surface-container-medium data-[highlighted]:text-display"
);

interface MenuTriggerProps {
	label: string;
	size: MenuSize;
	disabled?: boolean;
	ariaLabel: string;
}

function MenuTrigger(props: MenuTriggerProps) {
	return (
		<ArkMenu.Trigger
			type="button"
			disabled={props.disabled}
			aria-label={props.ariaLabel}
			class={clsx(triggerBaseClass, triggerSizeClass[props.size])}
		>
			<span class="truncate">{props.label}</span>
			<ChevronDown
				size={16}
				class="shrink-0 transition-transform group-data-[state=open]:rotate-180"
			/>
		</ArkMenu.Trigger>
	);
}

interface MenuItemRowProps {
	item: MenuItem;
}

function MenuItemRow(props: MenuItemRowProps) {
	return (
		<ArkMenu.Item
			value={props.item.value}
			valueText={props.item.label}
			disabled={props.item.disabled}
			class={itemClass}
		>
			<span
				class="flex h-5 w-5 shrink-0 items-center justify-center text-quaternary
					group-data-[highlighted]:text-tertiary"
			>
				<Show when={props.item.icon}>
					{(icon) => <Dynamic component={icon()} size={17} />}
				</Show>
			</span>
			<span class="truncate ts-body">{props.item.label}</span>
			<Show when={props.item.shortcut}>
				{(shortcut) => (
					<span class="pl-4 ts-caption text-quaternary group-data-[highlighted]:text-tertiary">
						{shortcut()}
					</span>
				)}
			</Show>
		</ArkMenu.Item>
	);
}

interface MenuListProps {
	items: readonly MenuItem[];
}

function MenuList(props: MenuListProps) {
	return (
		<For each={props.items}>
			{(item) => (
				<>
					<Show when={item.separatorBefore}>
						<ArkMenu.Separator class="my-1 h-px border-0 bg-split-lines" />
					</Show>
					<MenuItemRow item={item} />
				</>
			)}
		</For>
	);
}

interface MenuContentProps {
	items: readonly MenuItem[];
}

function MenuContent(props: MenuContentProps) {
	return (
		<Portal>
			<ArkMenu.Positioner class="z-50">
				<ArkMenu.Content class={contentClass}>
					<MenuList items={props.items} />
				</ArkMenu.Content>
			</ArkMenu.Positioner>
		</Portal>
	);
}

export default function Menu(props: MenuProps) {
	const [local, rest] = splitProps(props, [
		"class",
		"label",
		"items",
		"size",
		"disabled",
		"onSelect",
		"aria-label",
	]);

	const size = () => local.size ?? "md";
	const menuLabel = () => local["aria-label"] ?? local.label;

	return (
		<div class={clsx("relative inline-flex", local.class)} {...rest}>
			<ArkMenu.Root
				aria-label={menuLabel()}
				positioning={{ placement: "bottom-start", gutter: 8 }}
				onSelect={(details) => local.onSelect?.(details.value)}
			>
				<MenuTrigger
					label={local.label}
					size={size()}
					disabled={local.disabled}
					ariaLabel={menuLabel()}
				/>
				<MenuContent items={local.items} />
			</ArkMenu.Root>
		</div>
	);
}
