import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api, type ApiResult } from "@lib/api";
import type { CrawlerOverviewStats } from "@cvsa/contracts";
import { formatDateTime, formatMetric, formatWaitSeconds } from "../format";
import { MetricCard, QueueStatusTable } from "../statsView";
import { createRequestSequence } from "../videoActions";

type ActionStatus = "queued" | "failed";

type ActionRecord = {
	id: number;
	label: string;
	detail: string;
	status: ActionStatus;
	at: string;
};

export default function TasksSection() {
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
		setStatsError(res.ok ? "No stats" : res.error.message || "Queue status unavailable");
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
		setActions((current) => [record, ...current].slice(0, 5));
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
			toast.success(`${params.label} queued`);
			recordAction(params.label, params.detail, "queued");
			return;
		}
		toast.error(res.error.message || `${params.label} failed`);
		recordAction(params.label, params.detail, "failed");
	};

	const requireAid = (): string | null => {
		const value = aid().trim();
		if (!value) {
			toast.error("Enter an AID");
			return null;
		}
		return value;
	};

	const runSweep = () =>
		void runAction({
			key: "sweep",
			label: "Search sweep",
			detail: "Default keywords",
			action: () => api.crawler.triggerSweep({}),
		});

	const runDetailFetch = () => {
		const value = requireAid();
		if (!value) return;
		void runAction({
			key: "detail",
			label: "Detail fetch",
			detail: `AID ${value}`,
			action: () => api.crawler.fetchDetail(value),
		});
	};

	const runActiveDiscovery = () => {
		const value = requireAid();
		if (!value) return;
		void runAction({
			key: "active",
			label: "Active discovery",
			detail: `AID ${value}`,
			action: () => api.crawler.triggerActive(value),
		});
	};

	onMount(() => {
		void loadStats();
	});

	return (
		<div class="flex flex-col gap-6">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="ts-heading-2 text-primary">Tasks</h2>
				<Button
					size="sm"
					variant="outlined"
					disabled={loadingStats()}
					onClick={() => void loadStats()}
				>
					{loadingStats() ? "Refreshing" : "Refresh"}
				</Button>
			</div>

			<section class="flex flex-col gap-3">
				<h3 class="ts-subhead font-semibold text-primary">Queue status</h3>
				<Show
					when={stats()}
					fallback={
						<div class="p-6 text-center text-tertiary border border-border rounded">
							{loadingStats()
								? "Loading"
								: statsError() !== null
									? statsError()
									: "No queue status"}
						</div>
					}
				>
					{(current) => (
						<div class="flex flex-col gap-3">
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<MetricCard
									label="Overdue tracking"
									value={formatMetric(current().overdueTrackingCount)}
									hint={`Max lag ${formatWaitSeconds(current().maxOverdueLagSec)}`}
								/>
								<MetricCard
									label="Jobs / minute"
									value={formatMetric(current().jobsPerMin)}
								/>
								<MetricCard
									label="Requests / second"
									value={formatMetric(current().requestsPerSec)}
								/>
							</div>
							<QueueStatusTable queues={current().queues} />
						</div>
					)}
				</Show>
			</section>

			<section class="p-4 rounded border border-border flex flex-col gap-4">
				<h3 class="ts-subhead font-semibold text-primary">Manual actions</h3>
				<div class="flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						variant="outlined"
						disabled={pending() !== null}
						onClick={runSweep}
					>
						{pending() === "sweep" ? "Queuing" : "Search sweep"}
					</Button>
					<label class="ts-label text-primary" for="crawler-task-aid">
						AID
					</label>
					<input
						id="crawler-task-aid"
						type="text"
						inputmode="numeric"
						class="h-10 px-3 border border-border rounded text-primary bg-transparent w-60 text-sm"
						placeholder="170001"
						value={aid()}
						onInput={(event) => setAid(event.currentTarget.value)}
					/>
					<Button
						size="sm"
						variant="outlined"
						disabled={pending() !== null || !aid().trim()}
						onClick={runDetailFetch}
					>
						{pending() === "detail" ? "Queuing" : "Fetch details"}
					</Button>
					<Button
						size="sm"
						variant="filled"
						disabled={pending() !== null || !aid().trim()}
						onClick={runActiveDiscovery}
					>
						{pending() === "active" ? "Queuing" : "Active discovery"}
					</Button>
				</div>

				<div class="flex flex-col gap-2 border-t border-border pt-3">
					<span class="ts-caption text-tertiary">Task execution</span>
					<Show
						when={actions().length > 0}
						fallback={<span class="ts-caption text-tertiary">No actions yet</span>}
					>
						<div class="overflow-x-auto">
							<table class="w-full text-left ts-caption">
								<thead>
									<tr class="border-b border-border text-tertiary">
										<th class="py-2 px-3">Task</th>
										<th class="py-2 px-3">Target</th>
										<th class="py-2 px-3">Status</th>
										<th class="py-2 px-3">Queued at</th>
									</tr>
								</thead>
								<tbody>
									<For each={actions()}>
										{(record) => (
											<tr class="border-b border-border hover:bg-hover">
												<td class="py-2 px-3 text-primary">
													{record.label}
												</td>
												<td class="py-2 px-3 font-mono text-tertiary">
													{record.detail}
												</td>
												<td class="py-2 px-3">
													<span
														class={
															record.status === "queued"
																? "text-green-600"
																: "text-red-600"
														}
													>
														{record.status === "queued"
															? "Queued"
															: "Failed"}
													</span>
												</td>
												<td class="py-2 px-3 text-tertiary">
													{formatDateTime(record.at)}
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
		</div>
	);
}
