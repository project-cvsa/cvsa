import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Modal from "@components/ui/Modal";
import Select, { type SelectOption } from "@components/ui/Select";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	CrawlerOverviewStats,
	CrawlerQueueJobDetail,
	CrawlerQueueJobItem,
	CrawlerQueueJobsResponse,
} from "@cvsa/contracts";
import { formatDateTime } from "../format";
import { QueueStatusTable } from "../statsView";
import { createRequestSequence } from "../videoActions";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Trash2 from "lucide-solid/icons/trash-2";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

export default function TasksSection() {
	const t = getComponentT("crawler");

	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [loadingStats, setLoadingStats] = createSignal(false);
	const [statsError, setStatsError] = createSignal<string | null>(null);

	const [jobsData, setJobsData] = createSignal<CrawlerQueueJobsResponse | null>(null);
	const [loadingJobs, setLoadingJobs] = createSignal(false);
	const [jobsError, setJobsError] = createSignal<string | null>(null);

	const [selectedQueue, setSelectedQueue] = createSignal<string>("all");
	const [selectedState, setSelectedState] = createSignal<string>("all");

	// Job inspection drawer / modal
	const [inspectJob, setInspectJob] = createSignal<CrawlerQueueJobItem | null>(null);
	const [jobDetail, setJobDetail] = createSignal<CrawlerQueueJobDetail | null>(null);
	const [loadingJobDetail, setLoadingJobDetail] = createSignal(false);
	const [actionPending, setActionPending] = createSignal(false);

	const statsRequests = createRequestSequence();
	const jobsRequests = createRequestSequence();

	const openJobDetail = async (job: CrawlerQueueJobItem) => {
		setInspectJob(job);
		setJobDetail(null);
		setLoadingJobDetail(true);
		const res = await api.crawler.getQueueJobDetail(job.queue, job.id);
		setLoadingJobDetail(false);
		if (res.ok && res.data) {
			setJobDetail(res.data);
		} else {
			toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
		}
	};

	const handleRetryJob = async () => {
		const job = inspectJob();
		if (!job) return;
		setActionPending(true);
		const res = await api.crawler.retryQueueJob(job.queue, job.id);
		setActionPending(false);
		if (res.ok) {
			toast.success(t("common.saved"));
			setInspectJob(null);
			void loadJobs();
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	const handleRemoveJob = async () => {
		const job = inspectJob();
		if (!job) return;
		setActionPending(true);
		const res = await api.crawler.removeQueueJob(job.queue, job.id);
		setActionPending(false);
		if (res.ok) {
			toast.success(t("common.saved"));
			setInspectJob(null);
			void loadJobs();
		} else {
			toast.error(res.error.message || t("common.error"));
		}
	};

	const loadStats = async () => {
		const request = statsRequests.start();
		setLoadingStats(true);
		const res = await api.crawler.getStats("1h");
		if (!statsRequests.isCurrent(request)) return;
		setLoadingStats(false);
		if (res.ok && res.data) {
			setStats(res.data);
			setStatsError(null);
			return;
		}
		setStatsError(res.ok ? t("common.unknown") : res.error.message || t("common.error"));
	};

	const loadJobs = async () => {
		const request = jobsRequests.start();
		setLoadingJobs(true);
		const res = await api.crawler.getQueueJobs({
			queue: selectedQueue() === "all" ? undefined : selectedQueue(),
			state: selectedState() === "all" ? undefined : selectedState(),
			limit: 50,
		});
		if (!jobsRequests.isCurrent(request)) return;
		setLoadingJobs(false);
		if (res.ok && res.data) {
			setJobsData(res.data);
			setJobsError(null);
			return;
		}
		setJobsError(res.ok ? t("common.unknown") : res.error.message || t("common.error"));
	};

	const refreshAll = () => {
		void loadStats();
		void loadJobs();
	};

	onMount(() => {
		refreshAll();
	});

	const queueOptions: SelectOption[] = [
		{ value: "all", label: `${t("tasks.jobs.queue")}: ${t("common.all")}` },
		{ value: "tracking", label: "快照队列 (tracking)" },
		{ value: "discovery", label: "发现队列 (discovery)" },
	];

	const stateOptions: SelectOption[] = [
		{ value: "all", label: `${t("tasks.jobs.state")}: ${t("common.all")}` },
		{ value: "active", label: "进行中 (active)" },
		{ value: "waiting", label: "等待中 (waiting)" },
		{ value: "delayed", label: "延迟重试 (delayed)" },
		{ value: "failed", label: "执行失败 (failed)" },
	];

	const jobStateBadge = (state: string) => {
		switch (state) {
			case "active":
				return (
					<Badge variant="info" size="sm" dot>
						进行中
					</Badge>
				);
			case "waiting":
				return (
					<Badge variant="neutral" size="sm">
						等待中
					</Badge>
				);
			case "delayed":
				return (
					<Badge variant="warning" size="sm" dot>
						延迟
					</Badge>
				);
			case "failed":
				return (
					<Badge variant="danger" size="sm" dot>
						失败
					</Badge>
				);
			case "completed":
				return (
					<Badge variant="success" size="sm">
						已完成
					</Badge>
				);
			default:
				return (
					<Badge variant="neutral" size="sm">
						{state}
					</Badge>
				);
		}
	};

	return (
		<div class="flex flex-col gap-6">
			{/* Top Operational Toolbar */}
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex items-center gap-2">
					<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
						{t("tasks.title")}
					</span>
					<Show when={jobsData()}>
						{(data) => (
							<Badge variant="neutral" size="sm">
								{data().total} 个任务
							</Badge>
						)}
					</Show>
				</div>

				<div class="flex flex-wrap items-center gap-2.5">
					<Button
						size="sm"
						variant="outlined"
						loading={loadingStats() || loadingJobs()}
						onClick={refreshAll}
						class="gap-1.5 shrink-0"
					>
						<RefreshCw class="w-3.5 h-3.5" />
						<span>{t("common.refresh")}</span>
					</Button>
				</div>
			</div>

			{/* Section 1: Queue Backlog Status Table */}
			<section class="flex flex-col gap-2.5">
				<div class="flex items-center justify-between">
					<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
						{t("overview.queues.title")}
					</span>
				</div>
				<Show
					when={stats()?.queues}
					fallback={
						<div class="p-8 text-center text-tertiary border border-border bg-surface text-sm">
							{loadingStats()
								? t("common.loading")
								: (statsError() ?? t("queue.empty"))}
						</div>
					}
				>
					{(queues) => <QueueStatusTable queues={queues()} />}
				</Show>
			</section>

			{/* Section 2: Real-time Queue Jobs Inspection */}
			<section class="flex flex-col gap-3">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div class="flex items-center gap-2">
						<span class="ts-caption text-xs uppercase tracking-wider text-tertiary font-semibold">
							{t("tasks.jobs.title")}
						</span>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<div class="w-44">
							<Select
								size="sm"
								options={queueOptions}
								value={selectedQueue()}
								onValueChange={(val) => {
									setSelectedQueue(val ?? "all");
									void loadJobs();
								}}
							/>
						</div>
						<div class="w-40">
							<Select
								size="sm"
								options={stateOptions}
								value={selectedState()}
								onValueChange={(val) => {
									setSelectedState(val ?? "all");
									void loadJobs();
								}}
							/>
						</div>
					</div>
				</div>

				<div class="border border-border bg-surface">
					<Show
						when={(jobsData()?.items.length ?? 0) > 0}
						fallback={
							<div class="p-12 text-center text-tertiary text-sm">
								{loadingJobs()
									? t("common.loading")
									: (jobsError() ?? t("tasks.jobs.empty"))}
							</div>
						}
					>
						<div class="cvsa-scroll overflow-x-auto">
							<table class="w-full text-left ts-caption">
								<thead>
									<tr class="border-b border-border text-tertiary bg-surface-container-high uppercase tracking-wider text-xs">
										<th class="py-2.5 px-4 font-semibold w-28">
											{t("tasks.jobs.id")}
										</th>
										<th class="py-2.5 px-4 font-semibold w-32">
											{t("tasks.jobs.queue")}
										</th>
										<th class="py-2.5 px-4 font-semibold">
											{t("tasks.jobs.type")}
										</th>
										<th class="py-2.5 px-4 font-semibold w-24">
											{t("tasks.jobs.state")}
										</th>
										<th class="py-2.5 px-4 font-semibold w-20">
											{t("tasks.jobs.attempts")}
										</th>
										<th class="py-2.5 px-4 font-semibold">
											{t("tasks.jobs.reason")}
										</th>
										<th class="py-2.5 px-4 font-semibold text-right w-44">
											{t("tasks.jobs.time")}
										</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-border text-sm">
									<For each={jobsData()?.items ?? []}>
										{(job: CrawlerQueueJobItem) => (
											<tr
												class="hover:bg-hover transition-colors cursor-pointer group"
												onClick={() => void openJobDetail(job)}
											>
												<td class="py-2.5 px-4 font-mono text-xs text-primary group-hover:underline truncate max-w-28">
													{job.id}
												</td>
												<td class="py-2.5 px-4">
													<Badge
														variant={
															job.queue === "tracking"
																? "info"
																: "neutral"
														}
														size="sm"
													>
														{job.queue}
													</Badge>
												</td>
												<td class="py-2.5 px-4">
													<div class="flex flex-col gap-0.5">
														<span class="font-medium text-primary text-xs">
															{job.name}
														</span>
														<Show when={job.target}>
															{(target) => (
																<span class="text-tertiary text-xs font-mono">
																	{target()}
																</span>
															)}
														</Show>
													</div>
												</td>
												<td class="py-2.5 px-4">
													{jobStateBadge(job.state)}
												</td>
												<td class="py-2.5 px-4 font-mono text-xs text-secondary">
													{job.attempts}
												</td>
												<td class="py-2.5 px-4 text-xs text-tertiary break-words max-w-xs">
													{job.failedReason ? (
														<span class="text-error">
															{job.failedReason}
														</span>
													) : (
														"—"
													)}
												</td>
												<td class="py-2.5 px-4 font-mono text-xs text-tertiary text-right whitespace-nowrap">
													{formatDateTime(
														new Date(job.timestamp).toISOString()
													)}
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</div>
					</Show>
				</div>
			</section>

			{/* Job Details Drawer/Modal */}
			<Modal
				isOpen={Boolean(inspectJob())}
				onClose={() => setInspectJob(null)}
				title={
					<div class="flex items-center gap-2">
						<span>任务详情</span>
						<span class="font-mono text-xs text-tertiary font-normal">
							[{inspectJob()?.queue}] #{inspectJob()?.id}
						</span>
					</div>
				}
				size="xl"
				footer={
					<div class="flex items-center justify-between w-full">
						<div class="flex items-center gap-2">
							<Button
								variant="outlined"
								size="sm"
								class="text-error border-error/30 hover:border-error hover:bg-error/10 gap-1.5"
								loading={actionPending()}
								onClick={handleRemoveJob}
							>
								<Trash2 class="w-3.5 h-3.5" />
								<span>{t("common.delete")}</span>
							</Button>
							<Button
								variant="outlined"
								size="sm"
								class="gap-1.5"
								loading={actionPending()}
								onClick={handleRetryJob}
							>
								<RotateCcw class="w-3.5 h-3.5" />
								<span>重试任务</span>
							</Button>
						</div>
						<Button variant="ghost" size="sm" onClick={() => setInspectJob(null)}>
							{t("common.close")}
						</Button>
					</div>
				}
			>
				<Show
					when={!loadingJobDetail() && jobDetail()}
					fallback={
						<div class="p-8 text-center text-tertiary text-sm">
							{t("common.loading")}
						</div>
					}
				>
					{(detail) => (
						<div class="flex flex-col gap-4 text-xs">
							{/* Core metadata attributes */}
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-surface-container-low border border-border">
								<div>
									<div class="text-tertiary">任务状态</div>
									<div class="mt-1">{jobStateBadge(detail().state)}</div>
								</div>
								<div>
									<div class="text-tertiary">重试次数</div>
									<div class="mt-1 font-mono font-semibold text-primary">
										{detail().attempts}
									</div>
								</div>
								<div>
									<div class="text-tertiary">入队时间</div>
									<div class="mt-1 font-mono text-secondary">
										{formatDateTime(new Date(detail().timestamp).toISOString())}
									</div>
								</div>
								<div>
									<div class="text-tertiary">目标对象</div>
									<div class="mt-1 font-mono text-secondary">
										{detail().target ?? "—"}
									</div>
								</div>
							</div>

							{/* Failure Stack Trace */}
							<Show
								when={
									detail().failedReason || (detail().stacktrace?.length ?? 0) > 0
								}
							>
								<div class="flex flex-col gap-1.5">
									<span class="text-error font-semibold uppercase tracking-wider text-[11px]">
										异常信息与堆栈跟踪 (Failed Reason & Stack Trace)
									</span>
									<pre class="p-3 bg-surface-container-lowest border border-error/30 text-error font-mono text-[11px] overflow-x-auto whitespace-pre-wrap max-h-48 rounded-none">
										{detail().failedReason}
										{"\n"}
										{detail().stacktrace?.join("\n") ?? ""}
									</pre>
								</div>
							</Show>

							{/* Job Data Payload */}
							<div class="flex flex-col gap-1.5">
								<span class="text-tertiary font-semibold uppercase tracking-wider text-[11px]">
									任务载荷 (Job Data Payload)
								</span>
								<pre class="p-3 bg-surface-container-lowest border border-border text-primary font-mono text-[11px] overflow-x-auto max-h-48 rounded-none">
									{JSON.stringify(detail().data, null, 2)}
								</pre>
							</div>

							{/* Job Options */}
							<Show when={detail().opts}>
								{(opts) => (
									<div class="flex flex-col gap-1.5">
										<span class="text-tertiary font-semibold uppercase tracking-wider text-[11px]">
											调度选项 (Job Options)
										</span>
										<pre class="p-3 bg-surface-container-lowest border border-border text-secondary font-mono text-[11px] overflow-x-auto max-h-36 rounded-none">
											{JSON.stringify(opts(), null, 2)}
										</pre>
									</div>
								)}
							</Show>
						</div>
					)}
				</Show>
			</Modal>
		</div>
	);
}
