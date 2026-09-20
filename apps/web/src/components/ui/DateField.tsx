import { DateInput as ArkDateInput, useDateInputContext } from "@ark-ui/solid/date-input";
import {
	DatePicker as ArkDatePicker,
	type DateValue,
	parseDate,
	useDatePickerContext,
} from "@ark-ui/solid/date-picker";
import { parseDateTime } from "@internationalized/date";
import clsx from "clsx";
import { createEffect, createSignal, createUniqueId, For, Index, Show, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import CalendarDays from "lucide-solid/icons/calendar-days";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import X from "lucide-solid/icons/x";

export interface DateFieldProps {
	id?: string;
	class?: string;
	name?: string;
	value?: string;
	defaultValue?: string;
	label: string;
	locale?: string;
	granularity?: DateFieldGranularity;
	hourCycle?: 12 | 24;
	helperText?: string;
	errorText?: string;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	min?: string;
	max?: string;
	clearLabel?: string;
	calendarLabel?: string;
	todayLabel?: string;
	onValueChange?: (value: string | undefined) => void;
}

export type DateFieldGranularity = "day" | "hour" | "minute" | "second";

function parseIsoDate(
	value: string | undefined,
	granularity: DateFieldGranularity
): DateValue | undefined {
	if (!value) return undefined;
	try {
		if (granularity === "day") {
			return parseDate(value.split("T")[0]);
		}
		return parseDateTime(value.includes("T") ? value : `${value}T00:00:00`);
	} catch {
		return undefined;
	}
}

function toValues(value: string | undefined, granularity: DateFieldGranularity): DateValue[] {
	const date = parseIsoDate(value, granularity);
	return date ? [date] : [];
}

export default function DateField(props: DateFieldProps) {
	const [local] = splitProps(props, [
		"id",
		"class",
		"name",
		"value",
		"defaultValue",
		"label",
		"locale",
		"granularity",
		"hourCycle",
		"helperText",
		"errorText",
		"disabled",
		"readOnly",
		"required",
		"min",
		"max",
		"clearLabel",
		"calendarLabel",
		"todayLabel",
		"onValueChange",
	]);

	const uid = createUniqueId();
	const fieldId = () => local.id ?? uid;
	const errorId = () => `${fieldId()}-error`;
	const helperId = () => `${fieldId()}-helper`;
	const hasError = () => Boolean(local.errorText);
	const granularity = () => local.granularity ?? "day";
	const [dates, setDates] = createSignal<DateValue[]>(
		toValues(local.value ?? local.defaultValue, granularity())
	);

	createEffect(() => {
		if (local.value !== undefined) setDates(toValues(local.value, granularity()));
	});

	const updateValue = (nextDates: DateValue[]) => {
		setDates(nextDates);
		local.onValueChange?.(nextDates[0]?.toString());
	};

	const minDate = () => parseIsoDate(local.min, granularity());
	const maxDate = () => parseIsoDate(local.max, granularity());
	const describedBy = () => {
		if (hasError()) return errorId();
		return local.helperText ? helperId() : undefined;
	};

	return (
		<div class={clsx("flex flex-col gap-1.5", local.class)}>
			<ArkDatePicker.Root
				id={`${fieldId()}-picker`}
				value={dates()}
				locale={local.locale ?? "zh-CN"}
				min={minDate()}
				max={maxDate()}
				disabled={local.disabled}
				readOnly={local.readOnly}
				fixedWeeks
				startOfWeek={1}
				positioning={{ placement: "bottom-start", gutter: 8 }}
				onValueChange={(details) => updateValue(details.value)}
			>
				<ArkDatePicker.Control>
					<ArkDateInput.Root
						id={fieldId()}
						value={dates()}
						locale={local.locale ?? "zh-CN"}
						min={minDate()}
						max={maxDate()}
						disabled={local.disabled}
						readOnly={local.readOnly}
						required={local.required}
						invalid={hasError()}
						granularity={granularity()}
						hourCycle={local.hourCycle}
						shouldForceLeadingZeros
						format={(date) => date.toString()}
						onValueChange={(details) => updateValue(details.value)}
					>
						<DateFieldControl {...local} describedBy={describedBy()} />
						<ArkDateInput.HiddenInput name={local.name} />
					</ArkDateInput.Root>
				</ArkDatePicker.Control>

				<CalendarContent todayLabel={local.todayLabel} />
			</ArkDatePicker.Root>

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
		</div>
	);
}

function DateFieldControl(props: DateFieldProps & { describedBy?: string }) {
	const dateInput = useDateInputContext();
	return (
		<ArkDateInput.Control
			class={clsx(
				"group relative flex h-[58px] items-center border bg-surface transition-colors",
				props.errorText
					? "border-error"
					: "border-border hover:border-tertiary data-[focus]:border-primary",
				props.disabled && "opacity-60"
			)}
		>
			<ArkDateInput.Label
				class={clsx(
					"absolute left-4 top-2 z-1 ts-caption",
					props.errorText ? "text-error" : "text-tertiary"
				)}
			>
				{props.label}
				<Show when={props.required}>
					<span class="text-error"> *</span>
				</Show>
			</ArkDateInput.Label>

			<ArkDateInput.SegmentGroup
				class="flex h-full min-w-0 flex-1 items-end overflow-hidden px-4 pb-2 pt-6 outline-none"
				aria-describedby={props.describedBy}
			>
				<Index each={dateInput().getSegments()}>
					{(segment) => (
						// Ark's Solid Segment component looks up segments by type. Repeated
						// literals then all resolve to the first separator, so render the
						// machine-provided segment directly to preserve `/`, space and `:`.
						<span
							{...dateInput().getSegmentProps({ segment: segment() })}
							class={clsx(
								"min-w-0 rounded-none outline-none ts-body text-primary",
								segment().type === "literal" ? "px-0" : "px-0.5",
								segment().type === "hour" && "ml-2",
								"data-[editable]:focus:bg-primary data-[editable]:focus:text-display-inverted",
								"data-[placeholder-shown]:text-tertiary data-[disabled]:cursor-not-allowed"
							)}
						>
							{segment().text}
						</span>
					)}
				</Index>
			</ArkDateInput.SegmentGroup>

			<Show when={dateInput().value.length > 0 && !props.readOnly}>
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center text-quaternary outline-none hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary"
					aria-label={props.clearLabel}
					disabled={props.disabled}
					onclick={() => {
						dateInput().clearValue();
					}}
				>
					<X size={17} />
				</button>
			</Show>

			<ArkDatePicker.Trigger
				type="button"
				class="mr-1 flex h-10 w-10 shrink-0 items-center justify-center text-quaternary outline-none hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary"
				aria-label={props.calendarLabel}
			>
				<CalendarDays size={19} />
			</ArkDatePicker.Trigger>
		</ArkDateInput.Control>
	);
}

function CalendarContent(props: Pick<DateFieldProps, "todayLabel">) {
	const datePicker = useDatePickerContext();
	return (
		<Portal>
			<div class="relative w-full h-full left-0 top-0 z-50">
				<ArkDatePicker.Positioner class="">
					<ArkDatePicker.Content class="w-[min(calc(100vw-2rem),20rem)] bg-surface p-4 shadow-xl outline-none">
						<ArkDatePicker.View view="day">
							<ArkDatePicker.ViewControl class="mb-3 grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
								<ArkDatePicker.PrevTrigger
									type="button"
									class="flex h-11 items-center justify-center text-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
								>
									<ChevronLeft size={19} />
								</ArkDatePicker.PrevTrigger>
								<ArkDatePicker.RangeText class="text-center ts-label text-primary" />
								<ArkDatePicker.NextTrigger
									type="button"
									class="flex h-11 items-center justify-center text-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
								>
									<ChevronRight size={19} />
								</ArkDatePicker.NextTrigger>
							</ArkDatePicker.ViewControl>

							<CalendarTable />

							<button
								type="button"
								class="mt-3 h-10 w-full border border-border ts-label text-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary"
								onclick={() => datePicker().selectToday()}
							>
								{props.todayLabel}
							</button>
						</ArkDatePicker.View>
					</ArkDatePicker.Content>
				</ArkDatePicker.Positioner>
			</div>
		</Portal>
	);
}

function CalendarTable() {
	const datePicker = useDatePickerContext();
	return (
		<ArkDatePicker.Table class="w-full table-fixed border-collapse">
			<ArkDatePicker.TableHead>
				<ArkDatePicker.TableRow>
					<For each={datePicker().weekDays}>
						{(weekDay) => (
							<ArkDatePicker.TableHeader class="h-8 text-center ts-caption font-normal text-tertiary">
								{weekDay.narrow}
							</ArkDatePicker.TableHeader>
						)}
					</For>
				</ArkDatePicker.TableRow>
			</ArkDatePicker.TableHead>
			<ArkDatePicker.TableBody>
				<For each={datePicker().weeks}>
					{(week) => (
						<ArkDatePicker.TableRow>
							<For each={week}>{(day) => <CalendarDay day={day} />}</For>
						</ArkDatePicker.TableRow>
					)}
				</For>
			</ArkDatePicker.TableBody>
		</ArkDatePicker.Table>
	);
}

function CalendarDay(props: { day: DateValue }) {
	return (
		<ArkDatePicker.TableCell value={props.day} class="p-0.5">
			<ArkDatePicker.TableCellTrigger
				class={clsx(
					"flex aspect-square w-full items-center justify-center outline-none ts-label text-primary transition-colors",
					"hover:bg-hover focus-visible:outline-2 focus-visible:outline-primary",
					"data-[selected]:bg-primary data-[selected]:text-display-inverted",
					"data-[today]:border data-[today]:border-primary data-[outside-range]:text-quaternary data-[disabled]:opacity-35"
				)}
			>
				{props.day.day}
			</ArkDatePicker.TableCellTrigger>
		</ArkDatePicker.TableCell>
	);
}
