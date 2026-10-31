import StateBadge from "../StateBadge";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import Pagination from "../TablePagination";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, For, onCleanup, Show } from "solid-js";
import Button from "@components/ui/Button";
import Modal from "@components/ui/Modal";
import Select from "@components/ui/Select";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	CrawlerOverviewStats,
	CrawlerQueueJobDetail,
	CrawlerQueueJobItem,
	CrawlerQueueJobsQuery,
	CrawlerQueueJobsResponse,
} from "@cvsa/contracts";
import { formatDateTime } from "../format";
import { QueueStatusTable } from "../statsView";
import { createRequestSequence } from "../videoActions";

const jobDate = (value: number | null | undefined) =>
	value ? formatDateTime(new Date(value).toISOString()) : "—";

function JobDetail(props: { job: CrawlerQueueJobDetail }) {
	const t = getComponentT("crawler");
	return (
		<div class="flex flex-col gap-4 ts-caption">
			<dl class="grid grid-cols-2 gap-3">
				<For
					each={[
						[t("tasks.jobs.id"), props.job.id],
						[t("tasks.jobs.queue"), t(`audit.queues.${props.job.queue}`)],
						[t("tasks.jobs.state"), t(`audit.${props.job.state}`)],
						[t("tasks.jobs.attempts"), String(props.job.attempts)],
						[t("tasks.jobs.time"), jobDate(props.job.timestamp)],
						[t("audit.processed"), jobDate(props.job.processedOn)],
						[t("audit.finished"), jobDate(props.job.finishedOn)],
						[t("audit.target"), props.job.target ?? "—"],
					]}
				>
					{(row) => (
						<div>
							<dt class="text-tertiary">{row[0]}</dt>
							<dd class="mt-1 break-all">{row[1]}</dd>
						</div>
					)}
				</For>
			</dl>
			<Show when={props.job.failedReason || props.job.stacktrace?.length}>
				<div>
					<h3 class="text-error mb-2">{t("audit.stacktrace")}</h3>
					<pre class="cvsa-scroll max-h-56 overflow-auto whitespace-pre-wrap p-3 bg-surface-container-low text-error font-body">
						{props.job.failedReason}
						{"\n"}
						{props.job.stacktrace?.join("\n")}
					</pre>
				</div>
			</Show>
			<For
				each={[
					[t("audit.payload"), props.job.data],
					[t("audit.options"), props.job.opts],
					[t("audit.returnvalue"), props.job.returnvalue],
				]}
			>
				{(entry) => (
					<div>
						<h3 class="text-secondary mb-2">{String(entry[0])}</h3>
						<pre class="cvsa-scroll max-h-64 overflow-auto p-3 bg-surface-container-low font-body">
							{JSON.stringify(entry[1] ?? null, null, 2)}
						</pre>
					</div>
				)}
			</For>
		</div>
	);
}

export default function TasksSection() {
	const t = getComponentT("crawler");
	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [jobs, setJobs] = createSignal<CrawlerQueueJobsResponse | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [queue, setQueue] = createSignal<NonNullable<CrawlerQueueJobsQuery["queue"]>>("all");
	const [state, setState] = createSignal<NonNullable<CrawlerQueueJobsQuery["state"]>>("all");
	const [page, setPage] = createSignal(0);
	const [selected, setSelected] = createSignal<CrawlerQueueJobItem | null>(null);
	const [detail, setDetail] = createSignal<CrawlerQueueJobDetail | null>(null);
	const [detailError, setDetailError] = createSignal<string | null>(null);
	const [loadingDetail, setLoadingDetail] = createSignal(false);
	const [pending, setPending] = createSignal(false);
	const requests = createRequestSequence();
	const inspections = createRequestSequence();
	const PAGE_SIZE = 25;
	const refresh = async () => {
		const request = requests.start();
		setLoading(true);
		const [overview, result] = await Promise.all([
			api.crawler.getStats("1h"),
			api.crawler.getQueueJobs({
				queue: queue(),
				state: state(),
				limit: PAGE_SIZE,
				offset: page() * PAGE_SIZE,
			}),
		]);
		if (!requests.isCurrent(request)) return;
		setLoading(false);
		if (overview.ok && overview.data) setStats(overview.data);
		if (result.ok && result.data) {
			setJobs(result.data);
			setError(overview.ok ? null : overview.error.message || t("common.error"));
			if (page() > 0 && page() * PAGE_SIZE >= result.data.total) {
				setPage(Math.max(0, Math.ceil(result.data.total / PAGE_SIZE) - 1));
				void refresh();
			}
		} else setError(result.ok ? t("common.error") : result.error.message || t("common.error"));
	};
	const close = () => {
		if (pending()) return;
		inspections.start();
		setSelected(null);
		setDetail(null);
		setDetailError(null);
	};
	const inspect = async (job: CrawlerQueueJobItem) => {
		const request = inspections.start();
		setSelected(job);
		setDetail(null);
		setDetailError(null);
		setLoadingDetail(true);
		const result = await api.crawler.getQueueJobDetail(job.queue, job.id);
		if (!inspections.isCurrent(request)) return;
		setLoadingDetail(false);
		if (result.ok && result.data) setDetail(result.data);
		else
			setDetailError(
				result.ok ? t("common.error") : result.error.message || t("common.error")
			);
	};
	const act = async (action: "retry" | "remove") => {
		const job = detail();
		if (!job || pending()) return;
		if (
			(action === "retry" && job.state !== "failed") ||
			(action === "remove" && job.state === "active")
		)
			return;
		setPending(true);
		const result =
			action === "retry"
				? await api.crawler.retryQueueJob(job.queue, job.id)
				: await api.crawler.removeQueueJob(job.queue, job.id);
		setPending(false);
		if (result.ok) {
			toast.success(t("common.saved"));
			close();
			void refresh();
		} else toast.error(result.error.message || t("common.error"));
	};
	useCrawlerRefresh("tasks", () => {
		if (!loading() && !pending()) void refresh();
	});
	onCleanup(() => {
		inspections.start();
		requests.start();
	});

	const date = (value: number | null | undefined) =>
		value ? formatDateTime(new Date(value).toISOString()) : "—";
	const columns: TableColumn<CrawlerQueueJobItem>[] = [
		{
			id: "id",
			header: t("tasks.jobs.id"),
			class: "w-48 break-all",
			cell: (job) => (
				<button
					type="button"
					class="text-primary underline text-left"
					onClick={(event) => {
						event.stopPropagation();
						void inspect(job);
					}}
				>
					{job.id}
				</button>
			),
		},
		{
			id: "queue",
			header: t("tasks.jobs.queue"),
			class: "w-28",
			cell: (job) => t(`audit.queues.${job.queue}`),
		},
		{
			id: "type",
			header: t("tasks.jobs.type"),
			cell: (job) => (
				<div>
					<span>{job.name}</span>
					<Show when={job.target}>
						<div class="text-tertiary break-all">{job.target}</div>
					</Show>
				</div>
			),
		},
		{
			id: "state",
			header: t("tasks.jobs.state"),
			class: "w-28",
			cell: (job) => <StateBadge kind="job" state={job.state} />,
		},
		{
			id: "attempts",
			header: t("tasks.jobs.attempts"),
			class: "w-20",
			cell: (job) => job.attempts,
		},
		{
			id: "reason",
			header: t("tasks.jobs.reason"),
			class: "max-w-xs break-words text-error",
			cell: (job) => job.failedReason ?? "—",
		},
		{
			id: "time",
			header: t("tasks.jobs.time"),
			class: "w-44 whitespace-nowrap text-secondary",
			cell: (job) => date(job.timestamp),
		},
	];

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader title={<h2 class="ts-heading-2">{t("tasks.title")}</h2>} />
			<Show when={error()}>
				{(message) => (
					<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
						{message()}
					</div>
				)}
			</Show>
			<Show when={stats()}>{(data) => <QueueStatusTable queues={data().queues} />}</Show>
			<section class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center gap-2">
					<h3 class="ts-label mr-auto">{t("tasks.jobs.title")}</h3>
					<div class="w-40">
						<Select
							size="sm"
							aria-label={t("tasks.jobs.queue")}
							options={["all", "tracking", "discovery"].map((value) => ({
								value,
								label: t(`audit.queues.${value}`),
							}))}
							value={queue()}
							onValueChange={(value) => {
								if (
									value === "all" ||
									value === "tracking" ||
									value === "discovery"
								) {
									setQueue(value);
									setPage(0);
									void refresh();
								}
							}}
						/>
					</div>
					<div class="w-36">
						<Select
							size="sm"
							aria-label={t("tasks.jobs.state")}
							options={[
								"all",
								"active",
								"waiting",
								"delayed",
								"failed",
								"completed",
							].map((value) => ({ value, label: t(`audit.${value}`) }))}
							value={state()}
							onValueChange={(value) => {
								if (
									value === "all" ||
									value === "active" ||
									value === "waiting" ||
									value === "delayed" ||
									value === "failed" ||
									value === "completed"
								) {
									setState(value);
									setPage(0);
									void refresh();
								}
							}}
						/>
					</div>
				</div>
				<DataTable
					columns={columns}
					items={jobs()?.items ?? []}
					busy={loading()}
					onRowClick={(job) => void inspect(job)}
					empty={loading() ? t("common.loading") : t("tasks.jobs.empty")}
				/>
				<Pagination
					page={page()}
					total={jobs()?.total ?? 0}
					pageSize={PAGE_SIZE}
					busy={loading()}
					onPageChange={(next) => {
						setPage(next);
						void refresh();
					}}
				/>
			</section>
			<Modal
				isOpen={Boolean(selected())}
				onClose={close}
				title={t("audit.jobDetail")}
				size="xl"
				closeLabel={t("common.close")}
				footer={
					<>
						<Button
							size="sm"
							variant="outlined"
							class="text-error"
							disabled={!detail() || detail()?.state === "active" || pending()}
							onClick={() => void act("remove")}
						>
							{t("common.delete")}
						</Button>
						<Button
							size="sm"
							variant="outlined"
							disabled={detail()?.state !== "failed" || pending()}
							onClick={() => void act("retry")}
						>
							{t("common.retry")}
						</Button>
						<Button size="sm" variant="filled" disabled={pending()} onClick={close}>
							{t("common.close")}
						</Button>
					</>
				}
			>
				<Show when={loadingDetail()}>
					<p class="p-6 text-center">{t("common.loading")}</p>
				</Show>
				<Show when={detailError()}>
					{(message) => (
						<div
							role="alert"
							class="p-3 bg-error text-on-error ts-caption font-medium flex items-center justify-between gap-3"
						>
							<span>{message()}</span>
							<Button
								size="sm"
								variant="outlined"
								class="border-on-error text-on-error hover:bg-on-error/20"
								onClick={() => {
									const job = selected();
									if (job) void inspect(job);
								}}
							>
								{t("common.retry")}
							</Button>
						</div>
					)}
				</Show>
				<Show when={detail()}>{(job) => <JobDetail job={job()} />}</Show>
			</Modal>
		</div>
	);
}
