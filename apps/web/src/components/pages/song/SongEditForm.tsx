import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import { ToastContainer, toast } from "@components/ui/Toast";
import { api, type ApiErrorInfo } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { UpdateSongRequestDto } from "@cvsa/core";
import { createSignal } from "solid-js";

/**
 * Everything the form shows, already resolved to display strings by the page
 * that loaded the song. Only the members `PATCH /v2/song/:id` accepts are
 * submitted; the rest are placeholders until they get a component of their own.
 */
export interface SongEditFormValues {
	name: string;
	singers: string;
	duration: string;
	publishedAt: string;
	externalLinks: string;
}

export interface SongEditFormProps {
	songId: number;
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
		};

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

		setSubmitting(true);
		const result = await api.song.update(props.songId, body);
		setSubmitting(false);

		if (result.ok) {
			toast.success(t("save.success"));
			return;
		}
		toast.error(resolveErrorMessage(result.error));
	};

	return (
		<form ref={formRef} class="flex flex-col gap-8" onSubmit={handleSubmit}>
			<div class="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
				<div class="flex flex-col gap-5">
					<TextField
						name="duration"
						type="number"
						min="0"
						label={t("field.duration")}
						value={props.values.duration}
					/>

					<TextField
						name="publishedAt"
						type="datetime-local"
						label={t("field.publishedAt")}
						value={props.values.publishedAt}
					/>

					<TextField
						name="externalLinks"
						label={t("field.externalLinks")}
						value={props.values.externalLinks}
					/>
				</div>

				<div class="flex flex-col gap-5">
					<TextField name="name" label={t("field.name")} value={props.values.name} />

					<TextField
						name="singers"
						label={t("field.singers")}
						value={props.values.singers}
					/>
				</div>
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
