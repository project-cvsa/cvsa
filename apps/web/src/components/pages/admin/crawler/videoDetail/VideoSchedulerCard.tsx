import { Show } from "solid-js";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { VideoTrackingDto } from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";

interface VideoSchedulerCardProps {
	data: VideoTrackingDto;
}

export default function VideoSchedulerCard(props: VideoSchedulerCardProps) {
	const t = getComponentT("crawler");

	return (
		<div class="flex flex-col gap-3">
			<h3 class="ts-label text-primary font-semibold">{t("videoDetail.tracking")}</h3>

			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 ts-caption">
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.scheduleReason")}</span>
					<span class="font-medium text-primary">{props.data.scheduleReason ?? "—"}</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.targetMilestone")}</span>
					<span class="font-medium text-primary">
						{props.data.targetMilestone != null
							? formatMetric(props.data.targetMilestone)
							: "—"}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.eta")}</span>
					<span class="font-medium text-primary">
						{props.data.etaHours != null ? `${props.data.etaHours.toFixed(1)} h` : "—"}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.nextSnapshot")}</span>
					<span class="font-medium text-primary">
						{formatDateTime(props.data.nextSnapshotAt)}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.lastCaptured")}</span>
					<span class="font-medium text-primary">
						{formatDateTime(props.data.lastCapturedAt)}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.leaseUntil")}</span>
					<span class="font-medium text-primary">
						{formatDateTime(props.data.leaseUntil)}
					</span>
				</div>
			</div>

			<Show when={props.data.lastError}>
				{(err) => (
					<div
						role="alert"
						class="p-3 bg-error text-on-error ts-caption font-medium flex flex-col gap-0.5"
					>
						<span>
							{t("videoDetail.lastError")}: {err()}
						</span>
					</div>
				)}
			</Show>
		</div>
	);
}
