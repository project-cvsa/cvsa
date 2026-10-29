import { createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import Modal from "@components/ui/Modal";
import TextField from "@components/ui/TextField";
import { RadioGroup, type RadioOption } from "@components/ui/Radio";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { IngestVideoResponse } from "@cvsa/contracts";
import Plus from "lucide-solid/icons/plus";
import CheckCircle from "lucide-solid/icons/check-circle";

interface ManualIngestModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess?: (result: IngestVideoResponse) => void;
}

function IngestResult(props: { result: IngestVideoResponse }) {
	const t = getComponentT("crawler");
	return (
		<div class="p-4 border border-border bg-surface-container-high flex flex-col gap-3">
			<div class="flex items-center gap-2 text-primary ts-label">
				<CheckCircle class="w-4 h-4 text-primary" />
				<span>{props.result.alreadyTracked ? t("ingest.updated") : t("ingest.added")}</span>
			</div>

			<div class="flex items-start gap-4">
				<Show when={props.result.pic}>
					{(pic) => (
						<img
							src={pic()}
							alt={props.result.title}
							class="w-28 h-18 object-cover border border-border shrink-0"
						/>
					)}
				</Show>
				<div class="flex flex-col gap-1 min-w-0">
					<a
						href={`https://www.bilibili.com/video/${props.result.bvid}`}
						target="_blank"
						rel="noopener noreferrer"
						class="ts-label text-primary hover:underline line-clamp-2"
					>
						{props.result.title}
					</a>
					<div class="flex items-center gap-2 ts-caption text-secondary">
						<span>{props.result.bvid}</span>
						<span>·</span>
						<span>
							{t("videoDetail.uploader")}:{" "}
							{props.result.ownerName ?? t("ingest.unknown")}
						</span>
						<span>·</span>
						<span>
							{t("videoDetail.videoStatus")}: {props.result.state}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function ManualIngestModal(props: ManualIngestModalProps) {
	const t = getComponentT("crawler");

	const [identifier, setIdentifier] = createSignal("");
	const [mode, setMode] = createSignal<"new" | "regular" | "milestone" | "archive">("regular");
	const [submitting, setSubmitting] = createSignal(false);
	const [ingestResult, setIngestResult] = createSignal<IngestVideoResponse | null>(null);

	const modeOptions: RadioOption<"new" | "regular" | "milestone" | "archive">[] = [
		{
			value: "new",
			label: t("ingest.new"),
			description: t("ingest.newHelp"),
		},
		{
			value: "regular",
			label: t("ingest.regular"),
			description: t("ingest.regularHelp"),
		},
		{
			value: "milestone",
			label: t("ingest.milestone"),
			description: t("ingest.milestoneHelp"),
		},
		{
			value: "archive",
			label: t("ingest.archive"),
			description: t("ingest.archiveHelp"),
		},
	];

	const handleIngest = async (e: SubmitEvent) => {
		e.preventDefault();
		const raw = identifier().trim();
		if (!raw) {
			toast.error(t("ingest.required"));
			return;
		}

		setSubmitting(true);
		setIngestResult(null);

		const res = await api.crawler.ingestVideo({
			identifier: raw,
			state: mode(),
			priority: mode() === "new" ? 1 : 2,
		});

		setSubmitting(false);

		if (res.ok && res.data) {
			setIngestResult(res.data);
			toast.success(
				res.data.alreadyTracked
					? t("ingest.updated") + ": " + res.data.bvid
					: t("ingest.added") + ": " + res.data.title
			);
			props.onSuccess?.(res.data);
			return;
		}

		toast.error(res.ok ? t("common.error") : res.error.message || t("ingest.failed"));
	};

	const resetAndClose = () => {
		setIdentifier("");
		setIngestResult(null);
		props.onClose();
	};

	return (
		<Modal
			isOpen={props.isOpen}
			onClose={resetAndClose}
			size="lg"
			title={t("ingest.title")}
			closeLabel={t("common.close")}
		>
			<div class="flex flex-col gap-6">
				<p class="ts-caption text-secondary">{t("ingest.description")}</p>
				<form onSubmit={handleIngest} class="flex flex-col gap-5">
					<TextField
						label={t("ingest.identifier")}
						helperText={t("ingest.identifierHelp")}
						value={identifier()}
						onInput={(e) => setIdentifier(e.currentTarget.value)}
						disabled={submitting()}
						required
					/>

					<RadioGroup
						label={t("ingest.strategy")}
						value={mode()}
						onChange={setMode}
						options={modeOptions}
						disabled={submitting()}
					/>

					<div class="flex items-center justify-end gap-3 pt-2">
						<Button
							type="button"
							variant="outlined"
							onClick={resetAndClose}
							disabled={submitting()}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="submit"
							variant="filled"
							disabled={submitting() || !identifier().trim()}
							class="gap-1.5"
						>
							<Plus class="w-4 h-4" />
							<span>
								{submitting() ? t("ingest.submitting") : t("ingest.submit")}
							</span>
						</Button>
					</div>
				</form>

				{/* Ingest Result Preview */}
				<Show when={ingestResult()}>{(item) => <IngestResult result={item()} />}</Show>
			</div>
		</Modal>
	);
}
