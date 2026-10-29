import { Menu as ArkMenu } from "@ark-ui/solid/menu";
import clsx from "clsx";
import { controlSizeClass } from "./controlStyles";
import { type ComponentProps, For, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import type { LucideIcon } from "lucide-solid";
import ChevronDown from "lucide-solid/icons/chevron-down";

export type MenuSize = "sm" | "md" | "lg";
export type MenuPlacement = "bottom-start" | "bottom-end";

export interface MenuItem {
	value: string;
	label: string;
	icon?: LucideIcon;
	avatarUrl?: string | null;
	shortcut?: string;
	disabled?: boolean;
	separatorBefore?: boolean;
}

export interface MenuProps extends Omit<ComponentProps<"div">, "children" | "onSelect"> {
	label: string;
	items: readonly MenuItem[];
	size?: MenuSize;
	placement?: MenuPlacement;
	triggerIcon?: LucideIcon;
	iconOnly?: boolean;
	disabled?: boolean;
	onSelect?: (value: string) => void;
}

const triggerSizeClass: Record<MenuSize, string> = {
	sm: "px-2.5",
	md: "px-3.5",
	lg: "px-5",
};

const triggerBaseClass = clsx(
	"group inline-flex items-center text-primary transition-colors select-none",
	"focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary",
	"disabled:cursor-not-allowed disabled:opacity-50"
);

const standardTriggerClass = clsx(
	"justify-between gap-2.5",
	"border border-border bg-surface",
	"hover:border-tertiary hover:bg-hover active:bg-surface-container-high"
);

const iconOnlyTriggerClass = clsx(
	"h-10 w-10 justify-center border border-transparent bg-transparent px-1",
	"hover:border-transparent hover:bg-hover"
);

const contentClass = clsx(
	"min-w-56 border border-border bg-surface p-1.5 select-none",
	"shadow-xl outline-none"
);

const itemClass = clsx(
	"group flex items-center gap-2.5 min-h-9 w-full px-2.5 py-1.5",
	"text-left text-sm text-primary outline-none transition-colors cursor-pointer",
	"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
	"data-[highlighted]:bg-hover data-[highlighted]:text-primary"
);

interface MenuTriggerProps {
	label: string;
	size: MenuSize;
	triggerIcon?: LucideIcon;
	iconOnly?: boolean;
	disabled?: boolean;
	ariaLabel: string;
}

function MenuTrigger(props: MenuTriggerProps) {
	return (
		<ArkMenu.Trigger
			type="button"
			disabled={props.disabled}
			aria-label={props.ariaLabel}
			class={clsx(
				triggerBaseClass,
				props.iconOnly
					? iconOnlyTriggerClass
					: clsx(
							standardTriggerClass,
							controlSizeClass(props.size),
							triggerSizeClass[props.size]
						)
			)}
		>
			<Show
				when={props.iconOnly && props.triggerIcon}
				fallback={
					<>
						<span class="truncate">{props.label}</span>
						<ChevronDown
							size={16}
							class="shrink-0 transition-transform group-data-[state=open]:rotate-180"
						/>
					</>
				}
			>
				{(icon) => <Dynamic component={icon()} size={26} aria-hidden="true" />}
			</Show>
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
				class="flex h-8 w-8 shrink-0 items-center justify-center text-quaternary
					group-data-[highlighted]:text-tertiary"
			>
				<Show
					when={props.item.avatarUrl}
					fallback={
						<Show when={props.item.icon}>
							{(icon) => <Dynamic component={icon()} size={17} />}
						</Show>
					}
				>
					{(avatarUrl) => (
						<img class="h-8 w-8 rounded-full object-cover" src={avatarUrl()} alt="" />
					)}
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
						<ArkMenu.Separator class="my-2 h-px border-0 bg-split-lines" />
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
			<ArkMenu.Positioner class="z-50!">
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
		"placement",
		"triggerIcon",
		"iconOnly",
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
				positioning={{ placement: local.placement ?? "bottom-start", gutter: 8 }}
				onSelect={(details) => local.onSelect?.(details.value)}
			>
				<MenuTrigger
					label={local.label}
					size={size()}
					triggerIcon={local.triggerIcon}
					iconOnly={local.iconOnly}
					disabled={local.disabled}
					ariaLabel={menuLabel()}
				/>
				<MenuContent items={local.items} />
			</ArkMenu.Root>
		</div>
	);
}
