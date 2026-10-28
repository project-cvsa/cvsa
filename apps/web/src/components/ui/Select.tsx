import { Select as ArkSelect, createListCollection } from "@ark-ui/solid/select";
import clsx from "clsx";
import { type ComponentProps, createMemo, createUniqueId, For, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import X from "lucide-solid/icons/x";
import type { LucideIcon } from "lucide-solid";

export type SelectSize = "sm" | "md" | "lg";

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
	]);

	const uid = createUniqueId();
	const selectId = () => local.id ?? uid;
	const errorId = () => `${selectId()}-error`;
	const helperId = () => `${selectId()}-helper`;
	const hasError = () => Boolean(local.errorText);
	const isFloating = () => Boolean(local.label && !local.size);
	const collection = createMemo(() =>
		createListCollection<SelectOption>({
			items: [...local.options],
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
			isItemDisabled: (item) => Boolean(item.disabled),
		})
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
			positioning={{ placement: "bottom-start", gutter: 6 }}
			onValueChange={(details) => local.onValueChange?.(details.value[0])}
			class={clsx("flex flex-col gap-1.5 w-full", local.class)}
			{...rest}
		>
			<Show when={local.label && local.size}>
				<label for={selectId()} class="ts-caption text-secondary font-medium select-none">
					{local.label}
					<Show when={local.required}>
						<span class="text-error"> *</span>
					</Show>
				</label>
			</Show>

			<ArkSelect.Control
				class={clsx(
					"group relative flex items-center border bg-surface transition-colors w-full",
					isFloating()
						? "h-[58px]"
						: local.size === "sm"
							? "h-8"
							: local.size === "lg"
								? "h-14"
								: "h-10",
					hasError()
						? "border-error"
						: "border-border hover:border-tertiary focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
					local.disabled && "opacity-60"
				)}
			>
				<Show when={isFloating()}>
					<ArkSelect.Label
						class={clsx(
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
					class={clsx(
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
				>
					<ArkSelect.ValueText
						placeholder={local.placeholder}
						class={clsx(
							"min-w-0 flex-1 truncate text-primary data-[placeholder-shown]:text-tertiary",
							local.size === "sm" ? "text-xs" : isFloating() ? "ts-body" : "text-sm"
						)}
					/>
					<ArkSelect.Indicator
						class={clsx(
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
						class={clsx(
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
				<ArkSelect.Positioner class="z-50">
					<ArkSelect.Content class="z-60 max-h-[min(22rem,var(--available-height))] min-w-[var(--reference-width)] w-max max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto bg-surface p-1.5 shadow-xl outline-none border border-border transition-all duration-150 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95">
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
	return (
		<ArkSelect.Item
			item={props.option}
			class={clsx(
				"group flex cursor-default items-center gap-2.5 outline-none transition-colors",
				props.size === "sm" ? "min-h-8 px-2.5 py-1 text-xs" : "min-h-10 px-3 py-2 text-sm",
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
