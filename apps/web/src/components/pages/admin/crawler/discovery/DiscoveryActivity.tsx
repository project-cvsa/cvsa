import { createEffect, createSignal, For, Show } from "solid-js";
import type { DiscoveryActivity, DiscoverySampleItem, DiscoveryStatusDto } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import StateBadge from "../StateBadge";
import Button from "@components/ui/Button";
import Modal from "@components/ui/Modal";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import { api } from "@lib/api";
import { formatDateTime, formatWaitSeconds, formatJobTime, jobErrorSummary } from "../format";
import { discoveryJobTarget, discoveryJobTypeMessageKey } from "../labels";
import ExternalLink from "lucide-solid/icons/external-link";
import Compass from "lucide-solid/icons/compass";
import Trash2 from "lucide-solid/icons/trash-2";

function computeJobDuration(job: DiscoveryActivity): string {
	if (job.processedOn && job.finishedOn && job.finishedOn >= job.processedOn) {
		return formatWaitSeconds((job.finishedOn - job.processedOn) / 1000);
	}
	if (job.processedOn && job.state === "active") {
		return formatWaitSeconds(Math.max(0, (Date.now() - job.processedOn) / 1000));
	}
	return "—";
}

function isSubtask(job: DiscoveryActivity): boolean {
	if (job.task?.type === "fetch-video-details" || job.task?.type === "active-discovery")
		return true;
	if (job.name.startsWith("detail-") || job.name.startsWith("active-")) return true;
	if (job.name === "fetch-video-details" || job.name === "active-discovery") return true;
	return false;
}

export default function DiscoveryActivityView(props: {
	status: DiscoveryStatusDto | null;
	error: string | null;
}) {
	const t = getComponentT("crawler");

	const [selectedJob, setSelectedJob] = createSignal<DiscoveryActivity | null>(null);
	const [recentSamples, setRecentSamples] = createSignal<DiscoverySampleItem[]>([]);
	const [loadingSamples, setLoadingSamples] = createSignal(false);
	const [excludingAid, setExcludingAid] = createSignal<string | null>(null);

	const loadRecentAccepted = async () => {
		setLoadingSamples(true);
		const res = await api.crawler.listDiscoverySamples({
			limit: 8,
			sortBy: "capturedAt",
			sortOrder: "desc",
		});
		setLoadingSamples(false);
		if (res.ok && res.data) {
			setRecentSamples(res.data.items.filter((item) => item.decision !== "model_rejected"));
		}
	};

	createEffect(() => {
		props.status;
		void loadRecentAccepted();
	});

	const activeJob = () => props.status?.activeJobs?.find((job) => !isSubtask(job));

	const explorationJobs = () => (props.status?.recentJobs ?? []).filter((job) => !isSubtask(job));

	const handleExcludeSample = async (aid: string) => {
		if (excludingAid()) return;

		setExcludingAid(aid);

		const prev = recentSamples();
		setRecentSamples((items) => items.filter((item) => item.aid !== aid));

		const res = await api.crawler.labelDiscoverySample(aid, 0);
		setExcludingAid(null);
		if (res.ok) {
			toast.success(t("common.saved"));
		} else {
			setRecentSamples(prev);
			toast.error(res.error.message || t("common.error"));
		}
	};

	const taskColumns: TableColumn<DiscoveryActivity>[] = [
		{
			id: "type",
			header: t("discoveryActivity.type"),
			class: "w-44 font-medium text-primary",
			cell: (job) => (
				<button
					type="button"
					class="bg-transparent border-0 p-0 text-left text-primary font-medium cursor-pointer hover:underline"
					onClick={(event) => {
						event.stopPropagation();
						setSelectedJob(job);
					}}
				>
					{t(discoveryJobTypeMessageKey(job))}
				</button>
			),
		},
		{
			id: "target",
			header: t("discoveryActivity.target"),
			class: "text-secondary",
			cell: (job) => (
				<span class="truncate max-w-xs block ts-caption">{discoveryJobTarget(job, t)}</span>
			),
		},
		{
			id: "state",
			header: t("discoveryActivity.state"),
			class: "w-44",
			cell: (job) => (
				<div class="flex flex-col items-start gap-1">
					<StateBadge state={job.state} kind="job" />
					<Show when={job.failedReason}>
						{(reason) => (
							<span class="ts-caption text-error truncate block max-w-full">
								{jobErrorSummary(reason(), t)}
							</span>
						)}
					</Show>
				</div>
			),
		},
		{
			id: "duration",
			header: t("discoveryActivity.duration"),
			class: "w-20 tabular-nums whitespace-nowrap text-secondary",
			cell: (job) => computeJobDuration(job),
		},
		{
			id: "yield",
			header: t("discoveryActivity.yield"),
			class: "w-28 tabular-nums whitespace-nowrap text-primary",
			cell: (job) => (
				<span>
					{job.progress?.candidates ?? 0} <span class="text-tertiary">/</span>{" "}
					{job.progress?.queued ?? 0}
				</span>
			),
		},
		{
			id: "time",
			header: t("discoveryActivity.time"),
			class: "w-36 tabular-nums whitespace-nowrap text-tertiary ts-caption",
			cell: (job) => (
				<div class="flex flex-col">
					<span>{formatJobTime(job.finishedOn ?? job.timestamp)}</span>
				</div>
			),
		},
	];

	return (
		<section class="flex flex-col gap-6" aria-label={t("audit.activity")}>
			<Show when={props.error}>
				{(error) => (
					<p role="alert" class="ts-body text-error">
						{error()}
					</p>
				)}
			</Show>
			<div class="border border-border bg-surface p-4 flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<Compass class="w-5 h-5 text-primary" />
						<h3 class="ts-label font-semibold text-primary">
							{t("discoveryActivity.statusTitle")}
						</h3>
						<Show when={props.status}>
							{(status) => (
								<Badge variant={status().active ? "info" : "neutral"} dot size="sm">
									{status().active
										? t("discoveryActivity.scanning")
										: t("discoveryActivity.idle")}
								</Badge>
							)}
						</Show>
					</div>

					<div class="flex items-center gap-4 ts-caption text-secondary">
						<span>
							{t("discoveryActivity.activeQueue")}:{" "}
							<strong class="text-primary">{props.status?.counts.active ?? 0}</strong>
						</span>
						<span>
							{t("discoveryActivity.waitingQueue")}:{" "}
							<strong class="text-primary">
								{props.status?.counts.waiting ?? 0}
							</strong>
						</span>
					</div>
				</div>

				<Show when={activeJob()}>
					{(job) => (
						<div class="bg-surface-container-low p-3 flex flex-col gap-2 ts-caption border-l-2 border-primary">
							<div class="flex items-center justify-between font-medium text-primary">
								<span>
									{t("audit.running")}: {t(discoveryJobTypeMessageKey(job()))},{" "}
									{t("audit.target")}: {discoveryJobTarget(job(), t)}
								</span>
								<Show when={job().progress?.page}>
									<span class="text-secondary">
										{t("audit.page")} {job().progress?.page}
									</span>
								</Show>
							</div>
							<div class="text-secondary flex items-center gap-4">
								<span>
									{t("audit.found")}: {job().progress?.candidates ?? 0}
								</span>
								<span>
									{t("audit.queued")}: {job().progress?.queued ?? 0}
								</span>
								<span>
									{t("audit.updated")}:{" "}
									{formatDateTime(
										job().progress?.updatedAt ?? new Date().toISOString()
									)}
								</span>
							</div>
						</div>
					)}
				</Show>
			</div>

			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h3 class="ts-heading-3 text-primary">{t("discoveryActivity.historyTitle")}</h3>
				</div>

				<DataTable
					tableClass="table-fixed min-w-200"
					onRowClick={setSelectedJob}
					columns={taskColumns}
					items={explorationJobs()}
					empty={
						<div class="p-8 text-center text-tertiary bg-surface ts-caption">
							{t("discoveryActivity.emptyHistory")}
						</div>
					}
				/>
			</div>

			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h3 class="ts-heading-3 text-primary">{t("discoveryActivity.resultsTitle")}</h3>
				</div>

				<Show
					when={recentSamples().length > 0}
					fallback={
						<div class="p-8 text-center text-tertiary bg-surface border border-border ts-caption">
							{loadingSamples()
								? t("common.loading")
								: t("discoveryActivity.emptyResults")}
						</div>
					}
				>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
						<For each={recentSamples()}>
							{(item) => (
								<div class="border border-border bg-surface p-3 flex flex-col justify-between gap-3 hover:border-secondary transition-colors">
									<div class="flex items-start gap-3">
										<div class="w-16 h-10 shrink-0 bg-surface-container-high overflow-hidden flex items-center justify-center">
											<Show
												when={item.pic}
												fallback={
													<span class="ts-caption text-tertiary">
														{t("discoveryUi.noCover")}
													</span>
												}
											>
												<img
													src={item.pic ?? undefined}
													alt=""
													class="w-full h-full object-cover"
													loading="lazy"
													referrerPolicy="no-referrer"
													onError={(e) => {
														e.currentTarget.style.display = "none";
													}}
												/>
											</Show>
										</div>
										<div class="flex-1 min-w-0 flex flex-col gap-0.5">
											<a
												href={`https://www.bilibili.com/video/${item.bvid}`}
												target="_blank"
												rel="noopener noreferrer"
												class="font-medium text-primary hover:underline truncate inline-flex items-center gap-1 ts-caption"
												title={item.title}
											>
												<span class="truncate">{item.title}</span>
												<ExternalLink class="w-3 h-3 shrink-0 text-tertiary" />
											</a>
											<div class="flex items-center gap-2 ts-caption text-tertiary">
												<Badge
													variant={
														item.decision === "whitelist"
															? "success"
															: "info"
													}
													size="sm"
												>
													{item.decision === "whitelist"
														? t("discoveryActivity.decisionWhitelist")
														: t("discoveryActivity.decisionModel")}
												</Badge>
												<span class="tabular-nums">
													{(item.songProbability * 100).toFixed(0)}%
												</span>
											</div>
										</div>
									</div>

									<div class="flex items-center justify-between pt-2 border-t border-border ts-caption">
										<span class="text-tertiary tabular-nums">
											{formatDateTime(item.capturedAt)}
										</span>

										<Button
											variant="outlined"
											size="sm"
											class="h-6 px-2 ts-caption text-error border-error/50 hover:bg-error hover:text-on-error"
											disabled={excludingAid() === item.aid}
											onClick={() => void handleExcludeSample(item.aid)}
										>
											<Trash2 class="w-3 h-3 mr-1" />
											<span>{t("videos.action.exclude")}</span>
										</Button>
									</div>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>
			<Modal
				isOpen={selectedJob() !== null}
				onClose={() => setSelectedJob(null)}
				title={t("audit.jobDetail")}
				closeLabel={t("common.close")}
			>
				<Show when={selectedJob()}>
					{(job) => (
						<div class="flex flex-col gap-4">
							<div class="flex items-center gap-3">
								<h3 class="ts-label">{t(discoveryJobTypeMessageKey(job()))}</h3>
								<StateBadge kind="job" state={job().state} />
							</div>
							<p class="ts-caption text-secondary">
								{discoveryJobTarget(job(), t)} ·{" "}
								{formatDateTime(new Date(job().timestamp).toISOString())}
							</p>
							<Show when={job().failedReason}>
								{(reason) => (
									<pre class="font-code ts-caption whitespace-pre-wrap break-words max-h-80 overflow-auto text-error">
										{reason()}
									</pre>
								)}
							</Show>
							<p class="font-code ts-caption text-tertiary break-all">{job().id}</p>
						</div>
					)}
				</Show>
			</Modal>
		</section>
	);
}
