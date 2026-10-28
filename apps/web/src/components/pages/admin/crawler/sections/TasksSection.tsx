import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api, type ApiResult } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import { formatDateTime, formatMetric, formatWaitSeconds } from "../format";
import { MetricCard, QueueStatusTable } from "../statsView";
import { createRequestSequence } from "../videoActions";
import ListTodo from "lucide-solid/icons/list-todo";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Play from "lucide-solid/icons/play";
import Search from "lucide-solid/icons/search";
import Camera from "lucide-solid/icons/camera";
import History from "lucide-solid/icons/history";

type ActionStatus = "queued" | "failed";

type ActionRecord = {
	id: number;
	label: string;
	detail: string;
	status: ActionStatus;
	at: string;
};

export default function TasksSection() {
	const t = getComponentT("crawler");

	const [stats, setStats] = createSignal<CrawlerOverviewStats | null>(null);
	const [loadingStats, setLoadingStats] = createSignal(false);
	const [statsError, setStatsError] = createSignal<string | null>(null);
	const [aid, setAid] = createSignal("");
	const [pending, setPending] = createSignal<string | null>(null);
	const [actions, setActions] = createSignal<ActionRecord[]>([]);
	const statsRequests = createRequestSequence();
	let actionSequence = 0;

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

	const recordAction = (label: string, detail: string, status: ActionStatus) => {
		actionSequence += 1;
		const record: ActionRecord = {
			id: actionSequence,
			label,
			detail,
			status,
			at: new Date().toISOString(),
		};
		setActions((current) => [record, ...current].slice(0, 10));
	};

	const runAction = async (params: {
		key: string;
		label: string;
		detail: string;
		action: () => Promise<ApiResult<unknown>>;
	}) => {
		if (pending()) return;
		setPending(params.key);
		const res = await params.action();
		setPending(null);
		if (res.ok) {
			toast.success(t("common.success"));
			recordAction(params.label, params.detail, "queued");
			return;
		}
		toast.error(res.error.message || t("common.error"));
		recordAction(params.label, params.detail, "failed");
	};

	const requireAid = (): string | null => {
		const value = aid().trim();
		if (!value) {
			toast.error(t("tasks.manualSnapshot.aidPlaceholder"));
			return null;
		}
		return value;
	};

	const runSweep = () =>
		void runAction({
			key: "sweep",
			label: t("tasks.actions.sweep"),
			detail: "Default search keywords",
			action: () => api.crawler.triggerSweep({}),
		});

	const runDetailFetch = () => {
		const value = requireAid();
		if (!value) return;
		void runAction({
			key: "detail",
			label: t("tasks.actions.detail"),
			detail: `AID/BVID: ${value}`,
			action: () => api.crawler.fetchDetail(value),
		});
	};

	const runActiveDiscovery = () => {
		const value = requireAid();
		if (!value) return;
		void runAction({
			key: "active",
			label: t("tasks.actions.active"),
			detail: `AID/BVID: ${value}`,
			action: () => api.crawler.triggerActive(value),
		});
	};

	onMount(() => {
		void loadStats();
	});

	return (
		<div class="flex flex-col gap-6">
			{/* Page Subtitle & Description */}
			<div class="bg-surface p-5 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex flex-col gap-1.5">
					<h2 class="ts-heading-2 text-primary flex items-center gap-2">
						<ListTodo class="w-5 h-5 text-primary" />
						<span>{t("tasks.title")}</span>
					</h2>
					<p class="ts-body text-secondary text-sm leading-relaxed max-w-3xl">
						{t("tasks.description")}
					</p>
				</div>

				<Button
					size="sm"
					variant="outlined"
					disabled={loadingStats()}
					onClick={() => void loadStats()}
					class="gap-1.5 shrink-0 self-start sm:self-auto"
				>
					<RefreshCw class={"w-3.5 h-3.5 " + (loadingStats() ? "animate-spin" : "")} />
					<span>{loadingStats() ? t("common.refreshing") : t("common.refresh")}</span>
				</Button>
			</div>

			{/* Queue Status Section */}
			<div class="flex flex-col gap-4">
				<Show
					when={stats()}
					fallback={
						<div class="p-8 text-center text-tertiary border border-border bg-surface">
							{loadingStats()
								? t("common.loading")
								: statsError() !== null
									? statsError()
									: t("common.unknown")}
						</div>
					}
				>
					{(current) => (
						<div class="flex flex-col gap-4">
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
								<MetricCard
									label={t("tasks.queues.overdue")}
									value={formatMetric(current().overdueTrackingCount)}
									hint={`Lag: ${formatWaitSeconds(current().maxOverdueLagSec)}`}
								/>
								<MetricCard
									label={t("tasks.queues.jobsPerMin")}
									value={formatMetric(current().jobsPerMin)}
								/>
								<MetricCard
									label={t("tasks.queues.requestsPerSec")}
									value={formatMetric(current().requestsPerSec)}
								/>
							</div>

							<Card>
								<CardHeader title={t("tasks.queues.title")} />
								<CardContent class="p-0">
									<QueueStatusTable queues={current().queues} />
								</CardContent>
							</Card>
						</div>
					)}
				</Show>
			</div>

			{/* Manual Operations Card */}
			<Card>
				<CardHeader
					title={
						<div class="flex items-center gap-2">
							<Camera class="w-4 h-4 text-primary" />
							<span>{t("tasks.manualSnapshot.title")}</span>
						</div>
					}
				/>
				<CardContent class="flex flex-col gap-6">
					<div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
						<div class="flex-1">
							<TextField
								label={t("tasks.manualSnapshot.aid")}
								value={aid()}
								onInput={(e) => setAid(e.currentTarget.value)}
								helperText={t("tasks.manualSnapshot.aidPlaceholder")}
							/>
						</div>

						<div class="flex flex-wrap items-center gap-2 shrink-0">
							<Button
								size="md"
								variant="outlined"
								disabled={pending() !== null || !aid().trim()}
								onClick={runDetailFetch}
								class="gap-1.5"
							>
								<Search
									class={
										"w-4 h-4 " + (pending() === "detail" ? "animate-spin" : "")
									}
								/>
								<span>{t("tasks.actions.detail")}</span>
							</Button>
							<Button
								size="md"
								variant="filled"
								disabled={pending() !== null || !aid().trim()}
								onClick={runActiveDiscovery}
								class="gap-1.5"
							>
								<Play
									class={
										"w-4 h-4 " + (pending() === "active" ? "animate-spin" : "")
									}
								/>
								<span>{t("tasks.actions.active")}</span>
							</Button>
						</div>
					</div>

					<div class="pt-4 border-t border-border flex items-center justify-between">
						<div class="flex flex-col gap-0.5">
							<span class="ts-label font-medium text-primary">
								{t("tasks.actions.sweep")}
							</span>
							<span class="ts-caption text-tertiary">
								Trigger full rover sweep with default keyword dictionaries
							</span>
						</div>
						<Button
							size="sm"
							variant="outlined"
							disabled={pending() !== null}
							onClick={runSweep}
							class="gap-1.5"
						>
							<RefreshCw
								class={
									"w-3.5 h-3.5 " + (pending() === "sweep" ? "animate-spin" : "")
								}
							/>
							<span>
								{pending() === "sweep"
									? t("common.loading")
									: t("tasks.actions.sweep")}
							</span>
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Recent Action History Card */}
			<Card>
				<CardHeader
					title={
						<div class="flex items-center gap-2">
							<History class="w-4 h-4 text-primary" />
							<span>{t("tasks.recentHistory.title")}</span>
						</div>
					}
				/>
				<CardContent class="p-0">
					<Show
						when={actions().length > 0}
						fallback={
							<div class="p-8 text-center text-tertiary">
								{t("tasks.recentHistory.empty")}
							</div>
						}
					>
						<div class="overflow-x-auto">
							<table class="w-full text-left ts-caption">
								<thead>
									<tr class="border-b border-border text-tertiary bg-surface-container-low/50">
										<th class="py-3 px-4 font-medium">
											{t("tasks.history.col.task")}
										</th>
										<th class="py-3 px-4 font-medium">
											{t("tasks.history.col.target")}
										</th>
										<th class="py-3 px-4 font-medium">
											{t("tasks.history.col.status")}
										</th>
										<th class="py-3 px-4 font-medium text-right">
											{t("tasks.history.col.time")}
										</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-border">
									<For each={actions()}>
										{(record) => (
											<tr class="hover:bg-hover/50 transition-colors">
												<td class="py-3 px-4 font-medium text-primary">
													{record.label}
												</td>
												<td class="py-3 px-4 text-secondary">
													{record.detail}
												</td>
												<td class="py-3 px-4">
													<Badge
														variant={
															record.status === "queued"
																? "success"
																: "danger"
														}
														size="sm"
													>
														{record.status === "queued"
															? t("tasks.history.status.queued")
															: t("tasks.history.status.failed")}
													</Badge>
												</td>
												<td class="py-3 px-4 text-tertiary text-right">
													{formatDateTime(record.at)}
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</div>
					</Show>
				</CardContent>
			</Card>
		</div>
	);
}
