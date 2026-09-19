import Button from "@components/ui/Button";
import DateField from "@components/ui/DateField";
import DurationField from "@components/ui/DurationField";
import Select, { type SelectOption } from "@components/ui/Select";
import TextArea from "@components/ui/TextArea";
import TextField from "@components/ui/TextField";
import { ToastContainer, toast } from "@components/ui/Toast";
import { api, type ApiErrorInfo } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { UpdateSongRequestDto } from "@cvsa/core";
import type { SongType } from "@cvsa/db";
import { createSignal } from "solid-js";

const SONG_TYPES: readonly SongType[] = [
	"ORIGINAL",
	"COVER",
	"RETUNE",
	"CONTRAFACTUM",
	"TRANSLYRICS",
	"REMIX",
	"REMASTER",
	"MASHUP",
	"INSTRUMENTAL",
	"OTHERS",
];

function isSongType(value: string): value is SongType {
	return SONG_TYPES.some((type) => type === value);
}

export interface SongEditFormValues {
	name: string;
	type: SongType | "";
	coverUrl: string;
	duration: number;
	publishedAt: string;
	externalLinks: string;
	lyrics: string;
	lyricId?: number;
	lyricLanguage: string;
	description: string;
}

export interface SongEditFormProps {
	songId: number;
	locale: string;
	values: SongEditFormValues;
}

/** `datetime-local` is a local wall-clock value; the API wants an ISO instant. */
function toIsoString(value: string): string | undefined {
	if (!value) {
		return undefined;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function SongEditForm(props: SongEditFormProps) {
	const t = getComponentT("song-edit");
	let formRef: HTMLFormElement | undefined;
	const [submitting, setSubmitting] = createSignal(false);
	const [lyricId, setLyricId] = createSignal(props.values.lyricId);
	const [savedLyrics, setSavedLyrics] = createSignal(props.values.lyrics);
	const typeOptions: SelectOption[] = SONG_TYPES.map((value) => ({
		value,
		label: t(`type.${value}`),
	}));

	const resolveErrorMessage = (error: ApiErrorInfo): string => {
		if (error.code === "NETWORK_ERROR") {
			return t("save.error.network");
		}
		if (error.code === "UNAUTHORIZED") {
			return t("save.error.unauthorized");
		}
		// The backend already translated `message` for the request's locale.
		return error.message ?? t("save.error.generic");
	};

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting()) {
			return;
		}

		const data = new FormData(formRef);
		const body: UpdateSongRequestDto = {
			name: String(data.get("name") ?? ""),
			description: String(data.get("description") ?? ""),
		};

		const type = String(data.get("type") ?? "");
		if (isSongType(type)) {
			body.type = type;
		}

		const coverUrl = String(data.get("coverUrl") ?? "").trim();
		if (coverUrl !== "") {
			body.coverUrl = coverUrl;
		}

		const duration = String(data.get("duration") ?? "").trim();
		if (duration !== "") {
			const parsedDuration = Number.parseInt(duration, 10);
			if (Number.isFinite(parsedDuration)) {
				body.duration = parsedDuration;
			}
		}

		const publishedAt = toIsoString(String(data.get("publishedAt") ?? "").trim());
		if (publishedAt) {
			body.publishedAt = publishedAt;
		}

		const lyrics = String(data.get("lyrics") ?? "");

		setSubmitting(true);
		const result = await api.song.update(props.songId, body);

		if (!result.ok) {
			setSubmitting(false);
			toast.error(resolveErrorMessage(result.error));
			return;
		}

		if (lyrics !== savedLyrics()) {
			const currentLyricId = lyricId();
			const lyricResult = currentLyricId
				? await api.song.updateLyric(props.songId, currentLyricId, { plainText: lyrics })
				: lyrics.trim() === ""
					? undefined
					: await api.song.createLyric(props.songId, {
							language: props.values.lyricLanguage,
							plainText: lyrics,
						});

			if (lyricResult && !lyricResult.ok) {
				setSubmitting(false);
				toast.error(resolveErrorMessage(lyricResult.error));
				return;
			}
			if (lyricResult?.ok && lyricResult.data) {
				setLyricId(lyricResult.data.id);
			}
			setSavedLyrics(lyrics);
		}

		setSubmitting(false);
		toast.success(t("save.success"));
	};

	return (
		<form ref={formRef} class="flex flex-col gap-10" onSubmit={handleSubmit}>
			<div class="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
				<div class="flex flex-col gap-5">
					<TextField
						name="coverUrl"
						type="url"
						label={t("field.coverUrl")}
						defaultValue={props.values.coverUrl}
					/>

					<DurationField
						name="duration"
						label={t("field.duration")}
						minuteLabel={t("field.duration.minutes")}
						secondLabel={t("field.duration.seconds")}
						defaultValue={props.values.duration}
					/>

					<DateField
						name="publishedAt"
						label={t("field.publishedAt")}
						defaultValue={props.values.publishedAt}
						locale={props.locale}
						granularity="second"
						hourCycle={24}
						clearLabel={t("field.publishedAt.clear")}
						calendarLabel={t("field.publishedAt.calendar")}
						todayLabel={t("field.publishedAt.today")}
					/>

					<TextField
						name="externalLinks"
						label={t("field.externalLinks")}
						defaultValue={props.values.externalLinks}
					/>
				</div>

				<div class="flex flex-col gap-5">
					<TextField
						name="name"
						label={t("field.name")}
						defaultValue={props.values.name}
					/>

					<Select
						name="type"
						label={t("field.type")}
						placeholder={t("field.type.placeholder")}
						options={typeOptions}
						defaultValue={props.values.type || undefined}
					/>
				</div>
			</div>

			<div class="flex flex-col gap-5">
				<TextArea
					name="lyrics"
					label={t("field.lyrics")}
					defaultValue={props.values.lyrics}
					minRows={8}
					maxRows={18}
				/>

				<TextArea
					name="description"
					label={t("field.description")}
					defaultValue={props.values.description}
					minRows={6}
					maxRows={14}
				/>
			</div>

			<div class="flex items-center justify-end gap-3">
				<a
					href={`/song/${props.songId}`}
					class="inline-flex h-11 items-center justify-center border border-border bg-transparent px-6 ts-label color-primary transition-colors hover:bg-surface-container-medium focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-primary"
				>
					{t("action.cancel")}
				</a>
				<Button type="submit" disabled={submitting()}>
					{t("action.save")}
				</Button>
			</div>

			<ToastContainer />
		</form>
	);
}
