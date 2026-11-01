import { DateInput as ArkDateInput, useDateInputContext } from "@ark-ui/solid/date-input";
import {
	DatePicker as ArkDatePicker,
	type DateValue,
	parseDate,
	useDatePickerContext,
} from "@ark-ui/solid/date-picker";
import { parseDateTime } from "@internationalized/date";
import { cn } from "@lib/cn";
import { createEffect, createSignal, createUniqueId, Index, Show, splitProps } from "solid-js";
import { Portal } from "solid-js/web";
import CalendarDays from "lucide-solid/icons/calendar-days";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import X from "lucide-solid/icons/x";
import { controlSizeClass, type ControlSize } from "./controlStyles";

export interface DateFieldProps {
	id?: string;
	class?: string;
	name?: string;
	value?: string;
	defaultValue?: string;
	label: string;
	size?: ControlSize;
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
		"size",
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
		<div class={cn("flex flex-col gap-1.5 w-full", local.class)}>
			<Show when={local.size && local.label}>
				<label for={fieldId()} class="ts-caption text-secondary font-medium select-none">
					{local.label}
					<Show when={local.required}>
						<span class="text-error"> *</span>
					</Show>
				</label>
			</Show>

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
	const isCompact = () => Boolean(props.size);

	return (
		<ArkDateInput.Control
			class={cn(
				"group relative flex items-center border bg-surface transition-colors w-full",
				isCompact() ? controlSizeClass(props.size ?? "md") : "h-[58px]",
				props.errorText
					? "border-error"
					: "border-border hover:border-tertiary data-[focus]:border-primary",
				props.disabled && "opacity-60"
			)}
		>
			<Show when={!isCompact()}>
				<ArkDateInput.Label
					class={cn(
						"absolute left-4 top-2 z-1 ts-caption",
						props.errorText ? "text-error" : "text-tertiary"
					)}
				>
					{props.label}
					<Show when={props.required}>
						<span class="text-error"> *</span>
					</Show>
				</ArkDateInput.Label>
			</Show>

			<ArkDateInput.SegmentGroup
				class={cn(
					"flex h-full min-w-0 flex-1 items-center overflow-hidden outline-none",
					isCompact() ? "px-2.5" : "px-4 pb-2 pt-6 items-end"
				)}
				aria-describedby={props.describedBy}
			>
				<Index each={dateInput().getSegments()}>
					{(segment) => (
						<span
							{...dateInput().getSegmentProps({ segment: segment() })}
							class={cn(
								"min-w-0 rounded-none outline-none text-primary",
								isCompact() ? "ts-caption" : "ts-body",
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
					class={cn(
						"flex shrink-0 items-center justify-center text-quaternary outline-none hover:text-primary focus-visible:outline-1 focus-visible:outline-offset-[-4px] focus-visible:outline-primary",
						isCompact() ? "h-7 w-7" : "h-10 w-10"
					)}
					aria-label={props.clearLabel}
					disabled={props.disabled}
					onclick={() => {
						dateInput().clearValue();
					}}
				>
					<X size={isCompact() ? 14 : 17} />
				</button>
			</Show>

			<ArkDatePicker.Trigger
				type="button"
				class={cn(
					"mr-1 flex shrink-0 items-center justify-center text-quaternary outline-none hover:bg-hover hover:text-primary focus-visible:outline-1 focus-visible:outline-offset-[-4px] focus-visible:outline-primary",
					isCompact() ? "h-7 w-7" : "h-10 w-10"
				)}
				aria-label={props.calendarLabel}
			>
				<CalendarDays size={isCompact() ? 15 : 19} />
			</ArkDatePicker.Trigger>
		</ArkDateInput.Control>
	);
}

function CalendarContent(_props: Pick<DateFieldProps, "todayLabel">) {
	const datePicker = useDatePickerContext();
	return (
		<Portal>
			<div class="relative w-full h-full left-0 top-0 z-50">
				<ArkDatePicker.Positioner class="">
					<ArkDatePicker.Content class="w-[min(calc(100vw-2rem),20rem)] bg-surface p-4 shadow-xl outline-none border border-border">
						<ArkDatePicker.View view="day">
							<ArkDatePicker.ViewControl class="mb-3 grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
								<ArkDatePicker.PrevTrigger
									type="button"
									class="flex h-11 items-center justify-center text-primary outline-none hover:bg-hover focus-visible:outline-1 focus-visible:outline-primary"
								>
									<ChevronLeft size={19} />
								</ArkDatePicker.PrevTrigger>
								<ArkDatePicker.RangeText class="text-center ts-label text-primary" />
								<ArkDatePicker.NextTrigger
									type="button"
									class="flex h-11 items-center justify-center text-primary outline-none hover:bg-hover focus-visible:outline-1 focus-visible:outline-primary"
								>
									<ChevronRight size={19} />
								</ArkDatePicker.NextTrigger>
							</ArkDatePicker.ViewControl>

							<ArkDatePicker.Table class="w-full border-collapse">
								<ArkDatePicker.TableHead>
									<ArkDatePicker.TableRow class="grid grid-cols-7 gap-1">
										<Index each={datePicker().weekDays}>
											{(weekDay) => (
												<ArkDatePicker.TableHeader class="flex h-8 items-center justify-center ts-caption text-tertiary">
													{weekDay().short}
												</ArkDatePicker.TableHeader>
											)}
										</Index>
									</ArkDatePicker.TableRow>
								</ArkDatePicker.TableHead>

								<ArkDatePicker.TableBody>
									<Index each={datePicker().weeks}>
										{(week) => (
											<ArkDatePicker.TableRow class="grid grid-cols-7 gap-1">
												<Index each={week()}>
													{(day) => (
														<ArkDatePicker.TableCell value={day()}>
															<ArkDatePicker.TableCellTrigger
																class={cn(
																	"flex h-9 w-full items-center justify-center ts-caption outline-none transition-colors",
																	"hover:bg-hover focus-visible:outline-1 focus-visible:outline-primary",
																	"data-[outside-range]:text-quaternary",
																	"data-[today]:font-semibold data-[today]:text-primary",
																	"data-[selected]:bg-primary data-[selected]:text-display-inverted",
																	"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
																)}
															>
																{day().day}
															</ArkDatePicker.TableCellTrigger>
														</ArkDatePicker.TableCell>
													)}
												</Index>
											</ArkDatePicker.TableRow>
										)}
									</Index>
								</ArkDatePicker.TableBody>
							</ArkDatePicker.Table>
						</ArkDatePicker.View>
					</ArkDatePicker.Content>
				</ArkDatePicker.Positioner>
			</div>
		</Portal>
	);
}
