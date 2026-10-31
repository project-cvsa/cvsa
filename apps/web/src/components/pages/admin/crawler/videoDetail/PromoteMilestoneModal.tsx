import Modal from "@components/ui/Modal";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import { createSignal, createEffect } from "solid-js";
import { getComponentT } from "@lib/i18n/isomorphic";
import { api } from "@lib/api";
import { toast } from "@components/ui/Toast";

interface PromoteMilestoneModalProps {
	isOpen: boolean;
	onClose: () => void;
	aid: string;
	currentMilestone?: number | null;
	onSuccess: () => void;
}

export default function PromoteMilestoneModal(props: PromoteMilestoneModalProps) {
	const t = getComponentT("crawler");
	const [targetValue, setTargetValue] = createSignal("");
	const [submitting, setSubmitting] = createSignal(false);

	createEffect(() => {
		if (props.isOpen) {
			setTargetValue(props.currentMilestone ? String(props.currentMilestone) : "100000");
		}
	});

	const handleSubmit = async (e?: Event) => {
		e?.preventDefault();
		const num = Number.parseInt(targetValue(), 10);
		if (!Number.isFinite(num) || num <= 0) {
			toast.error(t("common.error"));
			return;
		}

		setSubmitting(true);
		const res = await api.crawler.promoteTracking(props.aid, {
			targetMilestone: num,
			priority: 1,
		});
		setSubmitting(false);

		if (res.ok) {
			toast.success(t("videoDetail.milestoneUpdated"));
			props.onSuccess();
			props.onClose();
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	return (
		<Modal
			isOpen={props.isOpen}
			onClose={props.onClose}
			title={t("videoDetail.promoteMilestoneTitle")}
			description={t("videoDetail.promoteMilestoneDesc")}
			size="md"
			footer={
				<div class="flex items-center justify-end gap-2 w-full">
					<Button
						variant="ghost"
						size="md"
						onClick={props.onClose}
						disabled={submitting()}
					>
						{t("common.cancel")}
					</Button>
					<Button
						variant="filled"
						size="md"
						loading={submitting()}
						onClick={() => void handleSubmit()}
					>
						{t("common.save")}
					</Button>
				</div>
			}
		>
			<form onSubmit={(e) => void handleSubmit(e)} class="flex flex-col gap-4 py-2">
				<TextField
					label={t("videoDetail.milestoneTarget")}
					value={targetValue()}
					onInput={(e) => setTargetValue(e.currentTarget.value)}
					placeholder="100000"
					type="number"
					min="1"
					step="1000"
					required
				/>

				<div class="flex flex-col gap-1.5">
					<span class="ts-caption text-tertiary font-medium">{t("common.actions")}</span>
					<div class="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outlined"
							size="sm"
							class="ts-caption"
							onClick={() => setTargetValue("100000")}
						>
							{t("videoDetail.milestoneQuick.100k")}
						</Button>
						<Button
							type="button"
							variant="outlined"
							size="sm"
							class="ts-caption"
							onClick={() => setTargetValue("1000000")}
						>
							{t("videoDetail.milestoneQuick.1m")}
						</Button>
						<Button
							type="button"
							variant="outlined"
							size="sm"
							class="ts-caption"
							onClick={() => setTargetValue("10000000")}
						>
							{t("videoDetail.milestoneQuick.10m")}
						</Button>
					</div>
				</div>
			</form>
		</Modal>
	);
}
