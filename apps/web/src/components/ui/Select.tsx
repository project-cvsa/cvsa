import { Select as ArkSelect, createListCollection } from "@ark-ui/solid/select";
import clsx from "clsx";
import { type ComponentProps, createMemo, createUniqueId, For, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import X from "lucide-solid/icons/x";
import type { LucideIcon } from "lucide-solid";

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
	label: string;
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
			positioning={{ placement: "bottom-start", gutter: 8, sameWidth: true }}
			onValueChange={(details) => local.onValueChange?.(details.value[0])}
			class={clsx("flex flex-col gap-1.5", local.class)}
			{...rest}
		>
			<ArkSelect.Control
				class={clsx(
					"group relative flex h-[58px] items-center border bg-surface transition-colors",
					hasError()
						? "border-error"
						: "border-border hover:border-tertiary focus-within:border-primary",
					local.disabled && "opacity-60"
				)}
			>
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

				<ArkSelect.Trigger
					class={clsx(
						"flex h-full min-w-0 flex-1 items-end bg-transparent py-2 pl-4 pt-6 text-left outline-none disabled:cursor-not-allowed",
						local.clearable ? "pr-12" : "pr-4"
					)}
					aria-describedby={describedBy()}
				>
					<ArkSelect.ValueText
						placeholder={local.placeholder}
						class="min-w-0 flex-1 truncate ts-body text-primary data-[placeholder-shown]:text-tertiary"
					/>
					<ArkSelect.Indicator
						class={clsx(
							"pointer-events-none absolute inset-y-0 flex shrink-0 items-center text-quaternary",
							local.clearable ? "right-12" : "right-4"
						)}
					>
						<ChevronDown
							size={18}
							class="transition-transform group-data-[state=open]:rotate-180"
						/>
					</ArkSelect.Indicator>
				</ArkSelect.Trigger>

				<Show when={local.clearable}>
					<ArkSelect.ClearTrigger
						type="button"
						class="mr-2 flex h-9 w-9 shrink-0 items-center justify-center text-quaternary outline-none hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
						aria-label={local.clearLabel}
					>
						<X size={17} />
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
					<ArkSelect.Content class="max-h-[min(22rem,var(--available-height))] w-[var(--reference-width)] overflow-y-auto bg-surface p-3 shadow-xl outline-none">
						<For each={local.options}>
							{(option) => <SelectOptionRow option={option} />}
						</For>
					</ArkSelect.Content>
				</ArkSelect.Positioner>
			</Portal>
			<ArkSelect.HiddenSelect />
		</ArkSelect.Root>
	);
}

function SelectOptionRow(props: { option: SelectOption }) {
	return (
		<ArkSelect.Item
			item={props.option}
			class={clsx(
				"group flex min-h-12 cursor-default items-center gap-3 px-3 outline-none transition-colors",
				"data-[highlighted]:bg-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
			)}
		>
			<Show when={props.option.icon}>
				<span class="flex h-8 w-8 items-center justify-center text-quaternary">
					<Show when={props.option.icon}>
						{(icon) => <Dynamic component={icon()} size={18} />}
					</Show>
				</span>
			</Show>
			<div class="min-w-0 flex-1 py-2">
				<ArkSelect.ItemText class="block truncate ts-body text-primary">
					{props.option.label}
				</ArkSelect.ItemText>
				<Show when={props.option.description}>
					{(description) => (
						<span class="mt-0.5 block truncate ts-caption text-tertiary">
							{description()}
						</span>
					)}
				</Show>
			</div>
			<ArkSelect.ItemIndicator class="text-primary">
				<Check size={17} />
			</ArkSelect.ItemIndicator>
		</ArkSelect.Item>
	);
}
