import { cn } from "@lib/cn";
import { Select as ArkSelect, createListCollection } from "@ark-ui/solid/select";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-solid";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import X from "lucide-solid/icons/x";
import { type ComponentProps, createMemo, createUniqueId, For, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { CONTROL_HEIGHT } from "./controlStyles";

const selectValueTextVariants = cva(
	"min-w-0 flex-1 truncate text-primary data-[placeholder-shown]:text-tertiary",
	{
		variants: {
			size: {
				sm: "text-caption tracking-caption",
				md: "text-label tracking-label",
				lg: "text-body tracking-body",
			},
		},
	}
);

const selectOptionVariants = cva(
	"group flex cursor-default items-center gap-2.5 outline-none transition-colors",
	{
		variants: {
			size: {
				sm: "min-h-8 px-2.5 py-1 text-caption tracking-caption",
				md: "min-h-10 px-3 py-2 text-label tracking-label",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

export type SelectSize = NonNullable<VariantProps<typeof selectValueTextVariants>["size"]>;

export interface SelectOption {
	value: string;
	label: string;
	description?: string;
	disabled?: boolean;
	icon?: LucideIcon;
}

export interface SelectProps extends Omit<ComponentProps<"div">, "onChange" | "onSelect"> {
	options: readonly SelectOption[];
	value?: string;
	defaultValue?: string;
	name?: string;
	label?: string;
	size?: SelectSize;
	placeholder?: string;
	helperText?: string;
	errorText?: string;
	disabled?: boolean;
	required?: boolean;
	clearable?: boolean;
	clearLabel?: string;
	onValueChange?: (value: string | undefined) => void;
}

export default function Select(props: SelectProps) {
	const [local, rest] = splitProps(props, [
		"class",
		"id",
		"options",
		"value",
		"defaultValue",
		"name",
		"label",
		"size",
		"placeholder",
		"helperText",
		"errorText",
		"disabled",
		"required",
		"clearable",
		"clearLabel",
		"onValueChange",
		"aria-describedby",
		"aria-label",
	]);

	const uid = createUniqueId();
	const selectId = () => local.id ?? uid;
	const errorId = () => `${selectId()}-error`;
	const helperId = () => `${selectId()}-helper`;
	const hasError = () => Boolean(local.errorText);
	const isFloating = () => Boolean(local.label && !local.size);
	const collection = createMemo(
		() =>
			createListCollection<SelectOption>({
				items: [...local.options],
				itemToString: (item) => item.label,
				itemToValue: (item) => item.value,
				isItemDisabled: (item) => Boolean(item.disabled),
			}),
		undefined,
		{
			equals: (prev, next) => {
				if (!prev || !next) return false;
				const prevItems = prev.items;
				const nextItems = next.items;
				if (prevItems.length !== nextItems.length) return false;
				return prevItems.every(
					(item, idx) =>
						item.value === nextItems[idx]?.value &&
						item.label === nextItems[idx]?.label &&
						Boolean(item.disabled) === Boolean(nextItems[idx]?.disabled)
				);
			},
		}
	);
	const describedBy = () => {
		const ids: string[] = [];
		if (hasError()) {
			ids.push(errorId());
		} else if (local.helperText) {
			ids.push(helperId());
		}
		if (local["aria-describedby"]) ids.push(local["aria-describedby"]);
		return ids.length > 0 ? ids.join(" ") : undefined;
	};

	return (
		<ArkSelect.Root<SelectOption>
			id={selectId()}
			collection={collection()}
			value={local.value === undefined ? undefined : [local.value]}
			defaultValue={local.defaultValue ? [local.defaultValue] : undefined}
			name={local.name}
			disabled={local.disabled}
			required={local.required}
			invalid={hasError()}
			closeOnSelect={true}
			unmountOnExit={true}
			onInteractOutside={(event) => {
				event.detail.focusable = true;
			}}
			positioning={{ placement: "bottom-start", gutter: 6 }}
			onValueChange={(details) => local.onValueChange?.(details.value[0])}
			class={cn("flex flex-col gap-1.5 w-full", local.class)}
			{...rest}
		>
			<Show when={local.label && local.size}>
				<ArkSelect.Label class="ts-caption text-secondary font-medium select-none">
					{local.label}
					<Show when={local.required}>
						<span class="text-error"> *</span>
					</Show>
				</ArkSelect.Label>
			</Show>

			<ArkSelect.Control
				class={cn(
					"group relative flex items-center border bg-surface transition-colors w-full",
					isFloating() ? "h-[58px]" : CONTROL_HEIGHT[local.size ?? "md"],
					hasError()
						? "border-error"
						: "border-border hover:border-tertiary focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
					local.disabled && "opacity-60"
				)}
			>
				<Show when={isFloating()}>
					<ArkSelect.Label
						class={cn(
							"pointer-events-none absolute left-4 top-2 z-1 ts-caption",
							hasError() ? "text-error" : "text-tertiary"
						)}
					>
						{local.label}
						<Show when={local.required}>
							<span class="text-error"> *</span>
						</Show>
					</ArkSelect.Label>
				</Show>

				<ArkSelect.Trigger
					class={cn(
						"flex h-full min-w-0 flex-1 items-center bg-transparent text-left outline-none disabled:cursor-not-allowed",
						isFloating()
							? "items-end py-2 pl-4 pt-6"
							: local.size === "sm"
								? "px-2.5"
								: "px-3.5",
						local.clearable
							? local.size === "sm"
								? "pr-7"
								: "pr-12"
							: local.size === "sm"
								? "pr-6"
								: "pr-8"
					)}
					aria-describedby={describedBy()}
					aria-label={local["aria-label"]}
				>
					<ArkSelect.ValueText
						placeholder={local.placeholder}
						class={cn(
							isFloating()
								? "ts-body"
								: selectValueTextVariants({ size: local.size ?? "md" })
						)}
					/>
					<ArkSelect.Indicator
						class={cn(
							"pointer-events-none absolute inset-y-0 flex shrink-0 items-center text-quaternary",
							local.clearable
								? local.size === "sm"
									? "right-6"
									: "right-10"
								: local.size === "sm"
									? "right-2"
									: "right-3"
						)}
					>
						<ChevronDown
							size={local.size === "sm" ? 14 : 18}
							class="transition-transform group-data-[state=open]:rotate-180"
						/>
					</ArkSelect.Indicator>
				</ArkSelect.Trigger>

				<Show when={local.clearable}>
					<ArkSelect.ClearTrigger
						type="button"
						class={cn(
							"mr-1 flex shrink-0 items-center justify-center text-quaternary outline-none hover:text-primary focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary",
							local.size === "sm" ? "h-6 w-6" : "h-9 w-9"
						)}
						aria-label={local.clearLabel}
					>
						<X size={local.size === "sm" ? 13 : 17} />
					</ArkSelect.ClearTrigger>
				</Show>
			</ArkSelect.Control>

			<Show when={hasError()}>
				<p id={errorId()} class="ts-caption text-error">
					{local.errorText}
				</p>
			</Show>
			<Show when={!hasError() && local.helperText}>
				<p id={helperId()} class="ts-caption text-tertiary">
					{local.helperText}
				</p>
			</Show>

			<Portal>
				<ArkSelect.Positioner class="z-50 pointer-events-none data-[state=open]:pointer-events-auto">
					<ArkSelect.Content class="z-60 pointer-events-auto max-h-[min(22rem,var(--available-height))] min-w-[var(--reference-width)] w-max max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto bg-surface p-1.5 shadow-xl outline-none border border-border transition-all duration-150 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95">
						<For each={local.options}>
							{(option) => <SelectOptionRow option={option} size={local.size} />}
						</For>
					</ArkSelect.Content>
				</ArkSelect.Positioner>
			</Portal>
			<ArkSelect.HiddenSelect />
		</ArkSelect.Root>
	);
}

function SelectOptionRow(props: { option: SelectOption; size?: SelectSize }) {
	const variantSize = () => (props.size === "sm" ? "sm" : "md");

	return (
		<ArkSelect.Item
			item={props.option}
			class={cn(
				selectOptionVariants({ size: variantSize() }),
				"data-[highlighted]:bg-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
			)}
		>
			<Show when={props.option.icon}>
				<span class="flex h-6 w-6 items-center justify-center text-quaternary shrink-0">
					<Show when={props.option.icon}>
						{(icon) => (
							<Dynamic component={icon()} size={props.size === "sm" ? 14 : 18} />
						)}
					</Show>
				</span>
			</Show>
			<div class="min-w-0 flex-1">
				<ArkSelect.ItemText class="block whitespace-normal break-words text-primary font-normal">
					{props.option.label}
				</ArkSelect.ItemText>
				<Show when={props.option.description}>
					{(description) => (
						<span class="mt-0.5 block whitespace-normal break-words ts-caption text-tertiary">
							{description()}
						</span>
					)}
				</Show>
			</div>
			<ArkSelect.ItemIndicator class="text-primary shrink-0">
				<Check size={props.size === "sm" ? 14 : 17} />
			</ArkSelect.ItemIndicator>
		</ArkSelect.Item>
	);
}
