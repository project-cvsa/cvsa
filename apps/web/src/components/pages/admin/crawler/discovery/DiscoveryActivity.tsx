import { Show } from "solid-js";
import type { DiscoveryStatusDto } from "@cvsa/contracts";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Badge from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";
import StateBadge from "../StateBadge";
import { formatDateTime, formatMetric } from "../format";

type ActivityJob = DiscoveryStatusDto["activeJobs"][number];

function ActivityTarget(props: { job: ActivityJob }) {
	const t = getComponentT("crawler");
	return (
		<div>
			<span>{props.job.target ?? props.job.name}</span>
			<Show when={props.job.progress?.page}>
				<span class="text-secondary">
					{" "}
					· {t("audit.page")} {props.job.progress?.page} · {props.job.progress?.order}
				</span>
			</Show>
			<Show when={props.job.failedReason}>
				<p class="text-error">{props.job.failedReason}</p>
			</Show>
		</div>
	);
}

export default function DiscoveryActivity(props: {
	status: DiscoveryStatusDto | null;
	error: string | null;
}) {
	const t = getComponentT("crawler");
	const jobs = () => [
		...(props.status?.activeJobs ?? []),
		...(props.status?.recentJobs.slice(0, 3) ?? []),
	];
	const columns: TableColumn<ActivityJob>[] = [
		{
			id: "state",
			header: t("tasks.jobs.state"),
			class: "w-24 whitespace-nowrap",
			cell: (job) => <StateBadge kind="job" state={job.state} />,
		},
		{
			id: "stage",
			header: t("audit.stage"),
			class: "w-32 whitespace-nowrap",
			cell: (job) => t(`audit.stages.${job.progress?.stage ?? "starting"}`),
		},
		{
			id: "target",
			header: t("audit.target"),
			class: "break-words",
			cell: (job) => <ActivityTarget job={job} />,
		},
		{
			id: "progress",
			header: t("audit.progress"),
			class: "w-48 whitespace-nowrap tabular-nums",
			cell: (job) =>
				`${t("audit.found")} ${job.progress?.candidates ?? 0} · ${t("audit.queued")} ${job.progress?.queued ?? 0}`,
		},
		{
			id: "updated",
			header: t("audit.updated"),
			class: "w-44 whitespace-nowrap",
			cell: (job) =>
				formatDateTime(
					job.progress?.updatedAt ??
						new Date(job.processedOn ?? job.timestamp).toISOString()
				),
		},
	];
	return (
		<section class="flex flex-col gap-3" aria-label={t("audit.activity")}>
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2 ts-caption">
				<h3 class="font-semibold text-primary">{t("audit.activity")}</h3>
				<Show when={props.status}>
					{(status) => (
						<>
							<Badge variant={status().active ? "info" : "neutral"} dot>
								{status().active ? t("audit.running") : t("audit.idle")}
							</Badge>
							<span>
								{t("audit.active")}: <strong>{status().counts.active}</strong>
							</span>
							<span>
								{t("audit.waiting")}: <strong>{status().counts.waiting}</strong>
							</span>
							<span>
								{t("audit.failed")}: <strong>{status().counts.failed}</strong>
							</span>
							<span>
								{t("audit.candidatesPerMin")}:{" "}
								<strong>{formatMetric(status().candidatesPerMin)}</strong>
							</span>
						</>
					)}
				</Show>
			</div>
			<Show when={props.error}>
				{(message) => (
					<p role="alert" class="text-error ts-caption">
						{message()}
					</p>
				)}
			</Show>
			<DataTable
				columns={columns}
				items={jobs()}
				empty={<span class="text-secondary">{t("audit.noActivity")}</span>}
			/>
		</section>
	);
}
