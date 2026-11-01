import { createEffect, createSignal, For, Show } from "solid-js";
import type { DiscoveryActivity, DiscoverySampleItem, DiscoveryStatusDto } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import Button from "@components/ui/Button";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import { api } from "@lib/api";
import { formatDateTime, formatWaitSeconds } from "../format";
import ExternalLink from "lucide-solid/icons/external-link";
import Compass from "lucide-solid/icons/compass";
import Trash2 from "lucide-solid/icons/trash-2";

function describeDiscoveryJob(job: DiscoveryActivity): string {
	if (job.name.includes("deep") || job.target?.includes("深度")) {
		return "全网深度挖掘";
	}
	if (job.name.includes("search-sweep") || job.name.includes("sweep-manual")) {
		return "增量轮巡";
	}
	if (job.name.startsWith("hot-sample")) {
		return "热门推荐扩展";
	}
	if (job.name.startsWith("active-")) {
		return "指定关联扩展";
	}
	return job.name;
}

function jobStateBadge(state: string) {
	switch (state) {
		case "active":
			return (
				<Badge variant="info" size="sm">
					进行中
				</Badge>
			);
		case "completed":
			return (
				<Badge variant="success" size="sm">
					已完成
				</Badge>
			);
		case "failed":
			return (
				<Badge variant="danger" size="sm">
					失败
				</Badge>
			);
		case "delayed":
			return (
				<Badge variant="warning" size="sm">
					延迟重试
				</Badge>
			);
		default:
			return (
				<Badge variant="neutral" size="sm">
					{state}
				</Badge>
			);
	}
}

function computeJobDuration(job: DiscoveryActivity): string {
	if (job.processedOn && job.finishedOn && job.finishedOn >= job.processedOn) {
		return formatWaitSeconds((job.finishedOn - job.processedOn) / 1000);
	}
	if (job.processedOn && job.state === "active") {
		return formatWaitSeconds(Math.max(0, (Date.now() - job.processedOn) / 1000));
	}
	return "—";
}

export default function DiscoveryActivityView(props: {
	status: DiscoveryStatusDto | null;
	error: string | null;
}) {
	const t = getComponentT("crawler");

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

	const activeJob = () =>
		props.status?.activeJobs?.find(
			(job) => !job.name.startsWith("detail-") && job.name !== "fetch-video-details"
		);

	const explorationJobs = () =>
		(props.status?.recentJobs ?? []).filter(
			(job) => !job.name.startsWith("detail-") && job.name !== "fetch-video-details"
		);

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
			header: "任务类型",
			class: "font-medium text-primary whitespace-nowrap",
			cell: (job) => (
				<span class="text-primary font-medium">{describeDiscoveryJob(job)}</span>
			),
		},
		{
			id: "target",
			header: "扫描目标",
			class: "text-secondary",
			cell: (job) => (
				<span class="truncate max-w-xs block ts-caption">{job.target ?? "—"}</span>
			),
		},
		{
			id: "state",
			header: "状态",
			class: "whitespace-nowrap",
			cell: (job) => jobStateBadge(job.state),
		},
		{
			id: "duration",
			header: "执行耗时",
			class: "tabular-nums whitespace-nowrap text-secondary",
			cell: (job) => computeJobDuration(job),
		},
		{
			id: "yield",
			header: "发现 / 入队",
			class: "tabular-nums whitespace-nowrap text-primary",
			cell: (job) => (
				<span>
					{job.progress?.candidates ?? 0} <span class="text-tertiary">/</span>{" "}
					{job.progress?.queued ?? 0}
				</span>
			),
		},
		{
			id: "time",
			header: "触发 / 完成时间",
			class: "tabular-nums whitespace-nowrap text-tertiary ts-caption",
			cell: (job) => (
				<div class="flex flex-col">
					<span>
						{formatDateTime(new Date(job.finishedOn ?? job.timestamp).toISOString())}
					</span>
				</div>
			),
		},
	];

	return (
		<section class="flex flex-col gap-6" aria-label={t("audit.activity")}>
			{/* Top Status Card */}
			<div class="border border-border bg-surface p-4 flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<Compass class="w-5 h-5 text-primary" />
						<h3 class="ts-label font-semibold text-primary">新曲发现运行状态</h3>
						<Show when={props.status}>
							{(status) => (
								<Badge variant={status().active ? "info" : "neutral"} dot size="sm">
									{status().active ? "正在扫描" : "空闲待机"}
								</Badge>
							)}
						</Show>
					</div>

					<div class="flex items-center gap-4 ts-caption text-secondary">
						<span>
							队列活跃:{" "}
							<strong class="text-primary">{props.status?.counts.active ?? 0}</strong>
						</span>
						<span>
							队列等待:{" "}
							<strong class="text-primary">
								{props.status?.counts.waiting ?? 0}
							</strong>
						</span>
						<span>
							延迟任务:{" "}
							<strong class="text-primary">
								{props.status?.counts.delayed ?? 0}
							</strong>
						</span>
					</div>
				</div>

				<Show when={activeJob()}>
					{(job) => (
						<div class="bg-surface-container-low p-3 flex flex-col gap-2 ts-caption border-l-2 border-primary">
							<div class="flex items-center justify-between font-medium text-primary">
								<span>
									正在运行: {describeDiscoveryJob(job())} · 目标:{" "}
									{job().target ?? job().name}
								</span>
								<Show when={job().progress?.page}>
									<span class="text-secondary">
										第 {job().progress?.page} 页 · 排序: {job().progress?.order}
									</span>
								</Show>
							</div>
							<div class="text-secondary flex items-center gap-4">
								<span>已扫描候选: {job().progress?.candidates ?? 0}</span>
								<span>加入详情队列: {job().progress?.queued ?? 0}</span>
								<span>
									更新时间:{" "}
									{formatDateTime(
										job().progress?.updatedAt ?? new Date().toISOString()
									)}
								</span>
							</div>
						</div>
					)}
				</Show>
			</div>

			{/* Exploration Task History Stream */}
			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h3 class="ts-heading-3 text-primary">探索任务执行记录</h3>
					<span class="ts-caption text-tertiary">
						仅展示增量轮巡、全网深度挖掘与推荐扩展的执行轨迹
					</span>
				</div>

				<DataTable
					columns={taskColumns}
					items={explorationJobs()}
					empty={
						<div class="p-8 text-center text-tertiary bg-surface ts-caption">
							暂无近期探索任务执行记录
						</div>
					}
				/>
			</div>

			{/* Recent Discovered Songs Feed */}
			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h3 class="ts-heading-3 text-primary">最新发现入库成果</h3>
					<span class="ts-caption text-tertiary">
						展示爬虫最近自动发现并成功入库的曲目（含白名单命中与 AI 分类器判定）
					</span>
				</div>

				<Show
					when={recentSamples().length > 0}
					fallback={
						<div class="p-8 text-center text-tertiary bg-surface border border-border ts-caption">
							{loadingSamples() ? t("common.loading") : "暂无最近发现记录"}
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
														No cover
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
														? "白名单"
														: "模型通过"}
												</Badge>
												<span class="tabular-nums">
													P(歌): {(item.songProbability * 100).toFixed(0)}
													%
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
		</section>
	);
}
