import { createEffect, createSignal, For, Show } from "solid-js";
import type { DiscoverySampleItem, DiscoveryStatusDto } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import { api } from "@lib/api";
import { formatDateTime, formatMetric } from "../format";
import ExternalLink from "lucide-solid/icons/external-link";
import Compass from "lucide-solid/icons/compass";
import Trash2 from "lucide-solid/icons/trash-2";

export default function DiscoveryActivity(props: {
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
			decision: "model_accepted",
			sortBy: "capturedAt",
			sortOrder: "desc",
		});
		setLoadingSamples(false);
		if (res.ok && res.data) {
			setRecentSamples(res.data.items);
		}
	};

	createEffect(() => {
		props.status;
		void loadRecentAccepted();
	});

	const activeJob = () => props.status?.activeJobs?.[0];
	const latestFinishedJob = () => props.status?.recentJobs?.[0];

	const handleExcludeSample = async (aid: string) => {
		if (excludingAid()) return;

		setExcludingAid(aid);

		// Optimistic remove
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

	return (
		<section class="flex flex-col gap-6" aria-label={t("audit.activity")}>
			{/* Funnel & Active Progress Card */}
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
							扫描速率:{" "}
							<strong class="text-primary">
								{formatMetric(props.status?.candidatesPerMin ?? 0)}/min
							</strong>
						</span>
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
					</div>
				</div>

				<Show
					when={activeJob()}
					fallback={
						<div class="ts-caption text-tertiary bg-surface-container-low p-3 flex items-center justify-between">
							<span>
								目前无正在运行的扫描任务。系统按定时计划执行搜索轮巡与推荐扩展。
							</span>
							<Show when={latestFinishedJob()}>
								{(job) => (
									<span>
										最近完成: {job().target ?? job().name} (
										{formatDateTime(
											new Date(
												job().finishedOn ?? job().timestamp
											).toISOString()
										)}
										)
									</span>
								)}
							</Show>
						</div>
					}
				>
					{(job) => (
						<div class="bg-surface-container-low p-3 flex flex-col gap-2 ts-caption border-l-2 border-primary">
							<div class="flex items-center justify-between font-medium text-primary">
								<span>
									当前阶段:{" "}
									{t(`audit.stages.${job().progress?.stage ?? "starting"}`)} ·
									目标: {job().target ?? job().name}
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

			{/* Recent Discovered Songs Feed */}
			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h3 class="ts-heading-3 text-primary">最新发现入库成果</h3>
					<span class="ts-caption text-tertiary">
						展示爬虫最近自动发现并判定为曲目的视频
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
												class="ts-label font-medium text-primary hover:underline line-clamp-2"
												title={item.title}
											>
												{item.title}
											</a>
											<div class="flex items-center gap-1.5 ts-caption text-tertiary">
												<span>av{item.aid}</span>
												<ExternalLink class="w-3 h-3" />
											</div>
										</div>
									</div>

									<div class="flex items-center justify-between pt-2 border-t border-border ts-caption">
										<Badge variant="success" size="sm">
											{item.decision === "whitelist"
												? "白名单"
												: `模型 ${(item.songProbability * 100).toFixed(0)}%`}
										</Badge>
										<Button
											variant="ghost"
											size="sm"
											class="text-error hover:bg-error hover:text-on-error h-7 px-2 ts-caption gap-1"
											disabled={excludingAid() === item.aid}
											onClick={() => void handleExcludeSample(item.aid)}
										>
											<Trash2 class="w-3 h-3" />
											<span>排除</span>
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
