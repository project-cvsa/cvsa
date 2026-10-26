import { Show } from "solid-js";
import DateField from "@components/ui/DateField";
import DurationField from "@components/ui/DurationField";
import Select, { type SelectOption } from "@components/ui/Select";
import TextArea from "@components/ui/TextArea";
import { getComponentT } from "@lib/i18n/isomorphic";

export interface InputExtensionsShowcaseProps {
	kind: "textarea" | "date" | "duration" | "select";
	locale: string;
}

export function InputExtensionsShowcase(props: InputExtensionsShowcaseProps) {
	const t = getComponentT("design-system");
	const categoryOptions: SelectOption[] = [
		{ value: "original", label: t("inputs.select.option.original") },
		{ value: "cover", label: t("inputs.select.option.cover") },
		{ value: "album", label: t("inputs.select.option.album") },
		{
			value: "pending",
			label: t("inputs.select.option.pending"),
			disabled: true,
		},
	];

	return (
		<div>
			<Show when={props.kind === "textarea"}>
				<TextArea
					label={t("inputs.textarea.label")}
					defaultValue={t("inputs.textarea.value")}
					maxLength={240}
					showCount
					autoResize
				/>
			</Show>

			<Show when={props.kind === "date"}>
				<DateField
					name="publishedAt"
					locale={props.locale}
					label={t("inputs.date.label")}
					defaultValue="2026-09-19"
					clearLabel={t("inputs.date.clear")}
					calendarLabel={t("inputs.date.calendar")}
					todayLabel={t("inputs.date.today")}
				/>
			</Show>

			<Show when={props.kind === "duration"}>
				<DurationField
					name="duration"
					label={t("inputs.duration.label")}
					minuteLabel={t("inputs.duration.minutes")}
					secondLabel={t("inputs.duration.seconds")}
					defaultValue={200}
				/>
			</Show>

			<Show when={props.kind === "select"}>
				<Select
					name="category"
					label={t("inputs.select.label")}
					placeholder={t("inputs.select.placeholder")}
					options={categoryOptions}
					defaultValue="original"
					clearable
					clearLabel={t("inputs.select.clear")}
				/>
			</Show>
		</div>
	);
}
