import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Select, { type SelectOption } from "@components/ui/Select";
import Tabs from "@components/ui/Tabs";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { createRequestSequence } from "../videoActions";
import type {
	DiscoveryFilterConfigDto,
	DiscoverySampleListResponse,
	DiscoveryStatusDto,
} from "@cvsa/contracts";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import GraphExplorer from "../discovery/GraphExplorer";
import DiscoveryActions from "../discovery/DiscoveryActions";
import DiscoveryCandidate from "../discovery/DiscoveryCandidate";
import type { SampleDecisionFilter, SampleLabeledFilter } from "../discoveryFilters";

export default function DiscoverySection(props: { active: boolean }) {
	const t = getComponentT("crawler");
	const sampleRequests = createRequestSequence();
	const [activeTab, setActiveTab] = createSignal<"review" | "graph">("review");
	const [filterConfig, setFilterConfig] = createSignal<DiscoveryFilterConfigDto | null>(null);
	const [_loadingConfig, setLoadingConfig] = createSignal(false);
	const [keyword, setKeyword] = createSignal("");
	const [pagesPerQuery, setPagesPerQuery] = createSignal<number>(2);
	const [runningSweep, setRunningSweep] = createSignal(false);
	const [runningHot, setRunningHot] = createSignal(false);
	const [sweepResult, setSweepResult] = createSignal<{ total: number; tracked: number } | null>(
		null
	);

	// Recommendation Seed Expansion State
	const [seedInput, setSeedInput] = createSignal("");
	const [runningSeedExpand, setRunningSeedExpand] = createSignal(false);
	const [discoveryStatus, setDiscoveryStatus] = createSignal<DiscoveryStatusDto | null>(null);

	const loadDiscoveryStatus = async () => {
		const res = await api.crawler.getDiscoveryStatus();
		if (res.ok && res.data) {
			setDiscoveryStatus(res.data);
		}
	};

	// Samples Workbench State
	const [samples, setSamples] = createSignal<DiscoverySampleListResponse | null>(null);
	const [loadingSamples, setLoadingSamples] = createSignal(false);
	const [samplesError, setSamplesError] = createSignal<string | null>(null);
	const [decisionFilter, setDecisionFilter] = createSignal<SampleDecisionFilter>("all");
	const [labeledFilter, setLabeledFilter] = createSignal<SampleLabeledFilter>("unlabeled");
	const [sortBy, setSortBy] = createSignal<"default" | "confidence_desc" | "confidence_asc">(
		"default"
	);
	const [page, setPage] = createSignal<number>(0);
	const [focusedIndex, setFocusedIndex] = createSignal<number>(0);
	const [labelingAid, setLabelingAid] = createSignal<string | null>(null);

	const sortOptions: SelectOption[] = [
		{ value: "default", label: "默认排序" },
		{ value: "confidence_desc", label: "置信度降序" },
		{ value: "confidence_asc", label: "置信度升序" },
	];

	const displayItems = () => {
		const raw = [...(samples()?.items ?? [])];
		if (sortBy() === "confidence_desc") {
			return raw.sort((a, b) => (b.songProbability ?? 0) - (a.songProbability ?? 0));
		}
		if (sortBy() === "confidence_asc") {
			return raw.sort((a, b) => (a.songProbability ?? 0) - (b.songProbability ?? 0));
		}
		return raw;
	};

	const pageSize = 15;

	const loadConfig = async () => {
		setLoadingConfig(true);
		const res = await api.crawler.getDiscoveryConfig();
		setLoadingConfig(false);
		if (res.ok && res.data) {
			setFilterConfig(res.data);
		}
	};

	const loadSamples = async () => {
		const request = sampleRequests.start();
		setLoadingSamples(true);
		setSamplesError(null);
		const query: {
			limit: number;
			offset: number;
			decision?: "whitelist" | "model_accepted" | "model_rejected_sampled";
			labeled?: boolean;
		} = {
			limit: pageSize,
			offset: page() * pageSize,
		};

		const dec = decisionFilter();
		if (dec !== "all") query.decision = dec;

		const lab = labeledFilter();
		if (lab === "labeled") query.labeled = true;
		else if (lab === "unlabeled") query.labeled = false;

		const res = await api.crawler.listDiscoverySamples(query);
		if (!sampleRequests.isCurrent(request)) return;
		setLoadingSamples(false);
		if (res.ok && res.data) {
			setSamples(res.data);
			setFocusedIndex(0);
			return;
		}
		setSamplesError(
			res.ok ? t("discoveryUi.loadFailed") : res.error.message || t("discoveryUi.loadFailed")
		);
	};

	onMount(() => {
		void loadConfig();
		void loadSamples();
		void loadDiscoveryStatus();

		const statusInterval = setInterval(() => {
			if (props.active) void loadDiscoveryStatus();
		}, 3000);
		onCleanup(() => clearInterval(statusInterval));

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!props.active || activeTab() !== "review") return;
			const activeEl = document.activeElement;
			if (
				activeEl &&
				(activeEl.tagName === "INPUT" ||
					activeEl.tagName === "TEXTAREA" ||
					activeEl.tagName === "SELECT" ||
					(activeEl.tagName === "BUTTON" &&
						activeEl.getAttribute("data-review-focus") !== "true") ||
					activeEl.getAttribute("role") === "combobox" ||
					activeEl.getAttribute("contenteditable") === "true")
			) {
				return;
			}

			const currentList = samples()?.items ?? [];
			if (currentList.length === 0) return;

			if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
				e.preventDefault();
				setFocusedIndex((prev) => Math.min(prev + 1, currentList.length - 1));
			} else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
				e.preventDefault();
				setFocusedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "1") {
				e.preventDefault();
				const item = currentList[focusedIndex()];
				if (item) void setHumanLabel(item.aid, true);
			} else if (e.key === "2") {
				e.preventDefault();
				const item = currentList[focusedIndex()];
				if (item) void setHumanLabel(item.aid, false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
	});

	const runSweep = async (customWord?: string) => {
		const targetKeyword = (customWord ?? keyword()).trim();
		setRunningSweep(true);
		setSweepResult(null);

		const res = await api.crawler.triggerSweep({
			keywords: targetKeyword ? [targetKeyword] : undefined,
			pagesPerQuery: pagesPerQuery(),
		});

		setRunningSweep(false);
		if (res.ok && res.data) {
			setSweepResult({
				total: res.data.totalDiscovered,
				tracked: res.data.newTracked,
			});
			toast.success(
				t("discoveryUi.scanResult")
					.replace("{total}", String(res.data.totalDiscovered))
					.replace("{tracked}", String(res.data.newTracked))
			);
			void loadSamples();
			return;
		}
		toast.error(
			res.ok
				? t("discoveryUi.sweepFailed")
				: res.error.message || t("discoveryUi.sweepFailed")
		);
	};

	const runHotSampling = async () => {
		setRunningHot(true);
		const res = await api.crawler.triggerHotSample();
		setRunningHot(false);
		if (res.ok && res.data) {
			toast.success(
				t("discoveryUi.scanResult")
					.replace("{total}", String(res.data.totalDiscovered))
					.replace("{tracked}", String(res.data.newTracked))
			);
			void loadSamples();
			return;
		}
		toast.error(
			res.ok
				? t("discoveryUi.actionFailed")
				: res.error.message || t("discoveryUi.actionFailed")
		);
	};

	const runSeedExpand = async () => {
		const raw = seedInput().trim();
		if (!raw) {
			toast.error(t("discoveryUi.identifierRequired"));
			return;
		}

		setRunningSeedExpand(true);
		let targetAid = raw;
		if (!/^\d+$/.test(raw)) {
			const graphRes = await api.crawler.getRecommendationGraph(raw);
			if (!graphRes.ok || !graphRes.data) {
				setRunningSeedExpand(false);
				toast.error(
					graphRes.ok
						? t("discoveryUi.videoNotFound")
						: graphRes.error.message || t("discoveryUi.videoFailed")
				);
				return;
			}
			targetAid = graphRes.data.seed.aid;
		}

		const res = await api.crawler.processVideoRecommendations(targetAid);
		setRunningSeedExpand(false);
		if (res.ok && res.data) {
			toast.success(
				t("discoveryUi.scanResult")
					.replace("{total}", String(res.data.relationsCount))
					.replace("{tracked}", String(res.data.newTracked))
			);
			setSeedInput("");
			void loadSamples();
			return;
		}
		toast.error(
			res.ok
				? t("discoveryUi.expandFailed")
				: res.error.message || t("discoveryUi.expandFailed")
		);
	};

	const setHumanLabel = async (aid: string, isSong: boolean) => {
		if (labelingAid()) return;
		setLabelingAid(aid);
		const targetLabel: 0 | 1 = isSong ? 1 : 0;

		setSamples((prev) => {
			if (!prev) return prev;
			return {
				...prev,
				items: prev.items.map((item) =>
					item.aid === aid
						? {
								...item,
								humanLabel: targetLabel,
							}
						: item
				),
			};
		});

		const res = await api.crawler.labelDiscoverySample(aid, targetLabel);
		setLabelingAid(null);
		if (res.ok) {
			toast.success(isSong ? t("discoveryUi.markedSong") : t("discoveryUi.markedNotSong"));
			if (focusedIndex() < (samples()?.items.length ?? 0) - 1) {
				setFocusedIndex((p) => p + 1);
			}
			return;
		}
		toast.error(
			res.ok
				? t("discoveryUi.labelFailed")
				: res.error.message || t("discoveryUi.labelFailed")
		);
		void loadSamples();
	};

	const decisionOptions: SelectOption[] = [
		{ value: "all", label: t("discoveryUi.allDecisions") },
		{ value: "whitelist", label: t("discoveryUi.whitelist") },
		{ value: "model_accepted", label: t("discoveryUi.modelAccepted") },
		{ value: "model_rejected_sampled", label: t("discoveryUi.modelRejected") },
	];

	const labeledOptions: SelectOption[] = [
		{ value: "all", label: t("discoveryUi.allLabels") },
		{ value: "unlabeled", label: t("discoveryUi.unlabeled") },
		{ value: "labeled", label: t("discoveryUi.labeled") },
	];

	const configuredKeywords = () => filterConfig()?.searchKeywords ?? [];

	return (
		<div class="flex flex-col gap-6">
			{/* Top Operational Toolbar */}
			<div class="flex items-center justify-between gap-4">
				<Tabs
					size="sm"
					value={activeTab()}
					onChange={(v) => setActiveTab(v as "review" | "graph")}
					items={[
						{ id: "review", label: t("discoveryUi.review") },
						{ id: "graph", label: t("discoveryUi.graph") },
					]}
				/>

				<Button
					size="sm"
					variant="outlined"
					loading={loadingSamples()}
					onClick={() => {
						void loadSamples();
						void loadDiscoveryStatus();
					}}
					class="gap-1.5"
				>
					<RefreshCw class="w-3.5 h-3.5" />
					<span>{t("discoveryUi.refresh")}</span>
				</Button>
			</div>

			<Show when={activeTab() === "review"}>
				<DiscoveryActions
					keyword={keyword}
					setKeyword={setKeyword}
					pagesPerQuery={pagesPerQuery}
					setPagesPerQuery={setPagesPerQuery}
					runningSweep={runningSweep}
					runSweep={runSweep}
					configuredKeywords={configuredKeywords}
					sweepResult={sweepResult}
					seedInput={seedInput}
					setSeedInput={setSeedInput}
					runningSeedExpand={runningSeedExpand}
					runSeedExpand={runSeedExpand}
					runningHot={runningHot}
					runHotSampling={runHotSampling}
					filterConfig={filterConfig}
				/>

				{/* Real-time Discovery Pipeline Monitor */}
				<div class="px-4 py-3 bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
					<div class="flex items-center gap-2.5">
						<span
							class={
								"w-2.5 h-2.5 rounded-full " +
								(discoveryStatus()?.active ||
								runningSweep() ||
								runningSeedExpand() ||
								runningHot()
									? "bg-warning animate-pulse"
									: "bg-success")
							}
						/>
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-semibold text-primary">
								{discoveryStatus()?.active ||
								runningSweep() ||
								runningSeedExpand() ||
								runningHot()
									? "发现引擎运行中 (Sweeping)"
									: "发现引擎就绪 (Idle)"}
							</span>
							<Show
								when={
									discoveryStatus()?.activeJobs &&
									(discoveryStatus()?.activeJobs.length ?? 0) > 0
								}
							>
								<span class="text-secondary font-mono">
									[正在处理:{" "}
									{discoveryStatus()?.activeJobs[0]?.target ??
										discoveryStatus()?.activeJobs[0]?.name}
									]
								</span>
							</Show>
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-4 text-secondary">
						<Show when={discoveryStatus()?.counts}>
							{(counts) => (
								<span class="font-mono">
									队列待处理:{" "}
									<strong class="text-primary">
										{counts().waiting + counts().active}
									</strong>{" "}
									(活跃: {counts().active})
								</span>
							)}
						</Show>
						<Show when={sweepResult()}>
							{(res) => (
								<span class="font-mono">
									最近抓取: <strong class="text-primary">{res().total}</strong> 条
									(新增追踪: <strong class="text-primary">{res().tracked}</strong>
									)
								</span>
							)}
						</Show>
						<span>
							待审池:{" "}
							<strong class="text-primary font-mono">{samples()?.total ?? 0}</strong>
						</span>
					</div>
				</div>
			</Show>

			{/* Sub-view 1: Candidate Review Workbench */}
			<Show when={activeTab() === "review"}>
				<div class="border border-border bg-surface flex flex-col">
					{/* Header Row */}
					<div class="px-4 py-3 border-b border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<div class="flex flex-wrap items-center gap-3">
							<span class="font-semibold text-primary">
								{t("discoveryUi.review")}
							</span>
							<Badge variant="neutral" size="sm">
								{samples()?.total ?? 0} 个样本
							</Badge>
							<span class="text-xs text-tertiary hidden md:inline ml-2">
								快捷键:{" "}
								<kbd class="px-1.5 py-0.5 bg-surface-container-high border border-border text-[11px] font-mono text-secondary">
									1
								</kbd>{" "}
								是曲目 ·{" "}
								<kbd class="px-1.5 py-0.5 bg-surface-container-high border border-border text-[11px] font-mono text-secondary">
									2
								</kbd>{" "}
								非曲目 ·{" "}
								<kbd class="px-1.5 py-0.5 bg-surface-container-high border border-border text-[11px] font-mono text-secondary">
									J/K
								</kbd>{" "}
								切换
							</span>
						</div>
						<div class="text-xs text-tertiary font-mono">
							第 {page() + 1} / {Math.ceil((samples()?.total || 1) / pageSize)} 页
						</div>
					</div>

					{/* Dedicated Filter & Pagination Toolbar */}
					<div class="px-4 py-2.5 bg-surface-container-low border-b border-border flex flex-wrap items-center justify-between gap-3 text-xs">
						<div class="flex flex-wrap items-center gap-3">
							<span class="text-tertiary font-medium">筛选:</span>
							<div class="w-36">
								<Select
									size="sm"
									options={decisionOptions}
									value={decisionFilter()}
									onValueChange={(val) => {
										if (
											val === "all" ||
											val === "whitelist" ||
											val === "model_accepted" ||
											val === "model_rejected_sampled"
										) {
											setDecisionFilter(val);
											setPage(0);
											void loadSamples();
										}
									}}
								/>
							</div>
							<div class="w-32">
								<Select
									size="sm"
									options={labeledOptions}
									value={labeledFilter()}
									onValueChange={(val) => {
										if (
											val === "all" ||
											val === "unlabeled" ||
											val === "labeled"
										) {
											setLabeledFilter(val);
											setPage(0);
											void loadSamples();
										}
									}}
								/>
							</div>
							<div class="w-32">
								<Select
									size="sm"
									options={sortOptions}
									value={sortBy()}
									onValueChange={(val) => {
										if (
											val === "default" ||
											val === "confidence_desc" ||
											val === "confidence_asc"
										) {
											setSortBy(val);
										}
									}}
								/>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<Button
								size="sm"
								variant="outlined"
								disabled={page() === 0 || loadingSamples()}
								onClick={() => {
									setPage((p) => Math.max(0, p - 1));
									void loadSamples();
								}}
								class="gap-1"
							>
								<ChevronLeft class="w-3.5 h-3.5" />
								<span>{t("discoveryUi.previous")}</span>
							</Button>
							<Button
								size="sm"
								variant="outlined"
								disabled={
									(page() + 1) * pageSize >= (samples()?.total ?? 0) ||
									loadingSamples()
								}
								onClick={() => {
									setPage((p) => p + 1);
									void loadSamples();
								}}
								class="gap-1"
							>
								<span>{t("discoveryUi.next")}</span>
								<ChevronRight class="w-3.5 h-3.5" />
							</Button>
						</div>
					</div>

					{/* Candidate List Content */}
					<Show
						when={samples()?.items.length ? samples() : undefined}
						fallback={
							<div class="p-12 text-center text-tertiary text-sm flex flex-col items-center gap-3">
								<span>
									{loadingSamples()
										? t("discoveryUi.loadingSamples")
										: samplesError()
											? samplesError()
											: t("discoveryUi.noSamples")}
								</span>
								<Show when={!loadingSamples()}>
									<Button
										size="sm"
										variant="outlined"
										onClick={() => void loadSamples()}
									>
										{t("discoveryUi.refresh")}
									</Button>
								</Show>
							</div>
						}
					>
						{(current) => (
							<div class="flex flex-col">
								<div class="flex flex-col divide-y divide-border">
									<For each={displayItems()}>
										{(item, idx) => (
											<DiscoveryCandidate
												item={item}
												index={idx()}
												focused={focusedIndex() === idx()}
												busy={labelingAid() !== null}
												onFocus={() => setFocusedIndex(idx())}
												onLabel={(isSong) =>
													void setHumanLabel(item.aid, isSong)
												}
											/>
										)}
									</For>
								</div>

								{/* Bottom Pagination Info */}
								<div class="flex items-center justify-between p-3 border-t border-border text-xs text-secondary bg-surface-container-low">
									<span>
										显示 {page() * pageSize + 1} -{" "}
										{Math.min((page() + 1) * pageSize, current().total)} 条，共{" "}
										{current().total} 条候选
									</span>
									<div class="flex items-center gap-2">
										<Button
											size="sm"
											variant="outlined"
											disabled={page() === 0 || loadingSamples()}
											onClick={() => {
												setPage((p) => Math.max(0, p - 1));
												void loadSamples();
											}}
											class="gap-1"
										>
											<ChevronLeft class="w-3.5 h-3.5" />
											<span>{t("discoveryUi.previous")}</span>
										</Button>
										<Button
											size="sm"
											variant="outlined"
											disabled={
												(page() + 1) * pageSize >= current().total ||
												loadingSamples()
											}
											onClick={() => {
												setPage((p) => p + 1);
												void loadSamples();
											}}
											class="gap-1"
										>
											<span>{t("discoveryUi.next")}</span>
											<ChevronRight class="w-3.5 h-3.5" />
										</Button>
									</div>
								</div>
							</div>
						)}
					</Show>
				</div>
			</Show>

			{/* Sub-view 2: Graph Explorer */}
			<Show when={activeTab() === "graph"}>
				<GraphExplorer onIngestSuccess={() => void loadSamples()} />
			</Show>
		</div>
	);
}
