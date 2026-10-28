import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import Select, { type SelectOption } from "@components/ui/Select";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { formatPercent } from "../format";
import type { DiscoveryFilterConfigDto, DiscoverySampleListResponse } from "@cvsa/contracts";
import ExternalLink from "lucide-solid/icons/external-link";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Check from "lucide-solid/icons/check";
import X from "lucide-solid/icons/x";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import GraphExplorer from "../discovery/GraphExplorer";
import type { SampleDecisionFilter, SampleLabeledFilter } from "../discoveryFilters";

export default function DiscoverySection() {
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
	const [newKeywordInput, setNewKeywordInput] = createSignal("");
	const [savingKeywords, setSavingKeywords] = createSignal(false);

	// Recommendation Seed Expansion State
	const [seedInput, setSeedInput] = createSignal("");
	const [runningSeedExpand, setRunningSeedExpand] = createSignal(false);

	// Samples Workbench State
	const [samples, setSamples] = createSignal<DiscoverySampleListResponse | null>(null);
	const [loadingSamples, setLoadingSamples] = createSignal(false);
	const [samplesError, setSamplesError] = createSignal<string | null>(null);
	const [decisionFilter, setDecisionFilter] = createSignal<SampleDecisionFilter>("all");
	const [labeledFilter, setLabeledFilter] = createSignal<SampleLabeledFilter>("unlabeled");
	const [page, setPage] = createSignal<number>(0);
	const [focusedIndex, setFocusedIndex] = createSignal<number>(0);
	const [labelingAid, setLabelingAid] = createSignal<string | null>(null);

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
		setLoadingSamples(false);
		if (res.ok && res.data) {
			setSamples(res.data);
			setFocusedIndex(0);
			return;
		}
		setSamplesError(res.ok ? "无法获取候选数据" : res.error.message || "无法获取候选数据");
	};

	onMount(() => {
		void loadConfig();
		void loadSamples();

		const handleKeyDown = (e: KeyboardEvent) => {
			const activeEl = document.activeElement;
			if (
				activeEl &&
				(activeEl.tagName === "INPUT" ||
					activeEl.tagName === "TEXTAREA" ||
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
				`扫描完成：发现 ${res.data.totalDiscovered} 个视频，新增纳入追踪 ${res.data.newTracked} 个`
			);
			void loadSamples();
			return;
		}
		toast.error(res.ok ? "抓取任务排队失败" : res.error.message || "抓取失败");
	};

	const runHotSampling = async () => {
		setRunningHot(true);
		const res = await api.crawler.triggerHotSample();
		setRunningHot(false);
		if (res.ok && res.data) {
			toast.success(
				`热门采样完成：扫描 ${res.data.totalDiscovered} 个关联视频，新增追踪 ${res.data.newTracked} 个`
			);
			void loadSamples();
			return;
		}
		toast.error(res.ok ? "触发失败" : res.error.message || "触发失败");
	};

	const runSeedExpand = async () => {
		const raw = seedInput().trim();
		if (!raw) {
			toast.error("请输入视频 BVID 或 AID");
			return;
		}

		setRunningSeedExpand(true);
		let targetAid = raw;
		if (!/^\d+$/.test(raw)) {
			const graphRes = await api.crawler.getRecommendationGraph(raw);
			if (!graphRes.ok || !graphRes.data) {
				setRunningSeedExpand(false);
				toast.error(
					graphRes.ok ? "未找到该视频" : graphRes.error.message || "视频查询失败"
				);
				return;
			}
			targetAid = graphRes.data.seed.aid;
		}

		const res = await api.crawler.processVideoRecommendations(targetAid);
		setRunningSeedExpand(false);
		if (res.ok && res.data) {
			toast.success(
				`推荐扩散完成：抓取关联 ${res.data.relationsCount} 条，新增追踪 ${res.data.newTracked} 条`
			);
			setSeedInput("");
			void loadSamples();
			return;
		}
		toast.error(res.ok ? "扩散失败" : res.error.message || "扩散失败");
	};

	const setHumanLabel = async (aid: string, isSong: boolean) => {
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
								decision: isSong ? "model_accepted" : "model_rejected_sampled",
							}
						: item
				),
			};
		});

		const res = await api.crawler.labelDiscoverySample(aid, targetLabel);
		setLabelingAid(null);
		if (res.ok) {
			toast.success(isSong ? "已标记为曲目并入库" : "已标记为非曲目");
			if (focusedIndex() < (samples()?.items.length ?? 0) - 1) {
				setFocusedIndex((p) => p + 1);
			}
			return;
		}
		toast.error(res.ok ? "标注失败" : res.error.message || "标注失败");
		void loadSamples();
	};

	const addConfigKeyword = async (word: string) => {
		const clean = word.trim();
		if (!clean) return;

		const current = filterConfig()?.searchKeywords ?? [];
		if (current.includes(clean)) {
			toast.error("词库中已存在该关键词");
			return;
		}

		const next = [...current, clean];
		setSavingKeywords(true);
		const res = await api.crawler.updateDiscoveryConfig({
			searchKeywords: next,
		});
		setSavingKeywords(false);
		if (res.ok && res.data) {
			setFilterConfig(res.data);
			setNewKeywordInput("");
			toast.success(`已添加关键词：${clean}`);
			return;
		}
		toast.error("更新词库失败");
	};

	const removeConfigKeyword = async (word: string) => {
		const current = filterConfig()?.searchKeywords ?? [];
		const next = current.filter((k) => k !== word);
		setSavingKeywords(true);
		const res = await api.crawler.updateDiscoveryConfig({
			searchKeywords: next,
		});
		setSavingKeywords(false);
		if (res.ok && res.data) {
			setFilterConfig(res.data);
			toast.success(`已移除关键词：${word}`);
			return;
		}
		toast.error("移除关键词失败");
	};

	const decisionOptions: SelectOption[] = [
		{ value: "all", label: "全部判定" },
		{ value: "whitelist", label: "白名单准入" },
		{ value: "model_accepted", label: "模型通过" },
		{ value: "model_rejected_sampled", label: "模型淘汰" },
	];

	const labeledOptions: SelectOption[] = [
		{ value: "all", label: "全部标注" },
		{ value: "unlabeled", label: "待人工复核" },
		{ value: "labeled", label: "已人工标注" },
	];

	const configuredKeywords = () => filterConfig()?.searchKeywords ?? [];

	const decisionBadge = (decision: string) => {
		switch (decision) {
			case "whitelist":
				return (
					<Badge variant="info" size="sm">
						白名单准入
					</Badge>
				);
			case "model_accepted":
				return (
					<Badge variant="success" size="sm">
						模型通过
					</Badge>
				);
			case "model_rejected_sampled":
				return (
					<Badge variant="warning" size="sm">
						模型淘汰
					</Badge>
				);
			default:
				return (
					<Badge variant="neutral" size="sm">
						{decision}
					</Badge>
				);
		}
	};

	return (
		<div class="flex flex-col gap-6">
			{/* Top Operational Toolbar */}
			<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface p-4 border border-border">
				<div class="flex items-center gap-3">
					<span class="ts-heading-3 text-primary font-semibold">新曲发现</span>
					<div class="flex items-center gap-2 text-xs text-secondary">
						<span>候选: {samples()?.total ?? 0}</span>
						<span>·</span>
						<span>词库: {configuredKeywords().length} 词</span>
						<span>·</span>
						<span>准入阈值: {filterConfig()?.modelThreshold ?? "0.70"}</span>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<div class="inline-flex border border-border bg-surface-container-low p-0.5">
						<button
							type="button"
							class={
								"px-3 py-1 text-xs font-medium transition-colors " +
								(activeTab() === "review"
									? "bg-primary text-display-inverted"
									: "text-primary hover:bg-hover")
							}
							onClick={() => setActiveTab("review")}
						>
							候选审查
						</button>
						<button
							type="button"
							class={
								"px-3 py-1 text-xs font-medium transition-colors " +
								(activeTab() === "graph"
									? "bg-primary text-display-inverted"
									: "text-primary hover:bg-hover")
							}
							onClick={() => setActiveTab("graph")}
						>
							推荐拓扑
						</button>
					</div>

					<Button
						size="sm"
						variant="outlined"
						disabled={loadingSamples()}
						onClick={() => void loadSamples()}
						class="gap-1.5"
					>
						<RefreshCw
							class={"w-3.5 h-3.5 " + (loadingSamples() ? "animate-spin" : "")}
						/>
						<span>刷新</span>
					</Button>
				</div>
			</div>

			{/* Operational Deck: Keyword Rover & Recommendation Graph */}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Keyword Rover & Lexicon */}
				<Card>
					<CardHeader title="关键词发现" />
					<CardContent class="p-4 flex flex-col gap-4">
						{/* Trigger Search */}
						<div class="flex items-end gap-3">
							<div class="flex-1">
								<TextField
									label="搜索关键词"
									value={keyword()}
									onInput={(e) => setKeyword(e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void runSweep();
										}
									}}
								/>
							</div>

							<div class="w-36 shrink-0">
								<Select
									label="抓取深度"
									options={[
										{ value: "1", label: "1 页 (20 条)" },
										{ value: "2", label: "2 页 (40 条)" },
										{ value: "3", label: "3 页 (60 条)" },
										{ value: "5", label: "5 页 (100 条)" },
									]}
									value={String(pagesPerQuery())}
									onValueChange={(val) =>
										setPagesPerQuery(Number.parseInt(val ?? "2", 10) || 2)
									}
								/>
							</div>

							<Button
								variant="filled"
								disabled={runningSweep()}
								onClick={() => void runSweep()}
								class="h-[58px] px-6 shrink-0"
							>
								{runningSweep() ? "抓取中..." : "抓取"}
							</Button>
						</div>

						{/* Keywords List */}
						<div class="flex flex-col gap-2 pt-3 border-t border-border">
							<div class="flex items-center justify-between text-xs">
								<span class="font-medium text-secondary">
									词库 ({configuredKeywords().length})
								</span>
								<span class="text-tertiary">点击发起抓取</span>
							</div>

							<div class="flex flex-wrap items-center gap-1.5 min-h-[30px]">
								<For
									each={configuredKeywords()}
									fallback={
										<span class="text-tertiary text-xs">
											未配置自定义词，使用默认词库
										</span>
									}
								>
									{(word) => (
										<div class="inline-flex items-center gap-1 px-2 py-0.5 border border-border bg-surface-container-low text-xs group hover:border-primary transition-colors">
											<button
												type="button"
												class="text-primary hover:underline cursor-pointer"
												title="以此词执行抓取"
												onClick={() => {
													setKeyword(word);
													void runSweep(word);
												}}
											>
												{word}
											</button>
											<button
												type="button"
												class="text-tertiary hover:text-error ml-0.5 cursor-pointer"
												title="移除关键词"
												onClick={() => void removeConfigKeyword(word)}
											>
												<X class="w-3 h-3" />
											</button>
										</div>
									)}
								</For>
							</div>

							{/* Add keyword form */}
							<div class="flex items-end gap-2 pt-1 max-w-sm">
								<div class="flex-1">
									<TextField
										label="添加关键词"
										value={newKeywordInput()}
										onInput={(e) => setNewKeywordInput(e.currentTarget.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												void addConfigKeyword(newKeywordInput());
											}
										}}
									/>
								</div>
								<Button
									size="md"
									variant="outlined"
									disabled={savingKeywords() || !newKeywordInput().trim()}
									onClick={() => void addConfigKeyword(newKeywordInput())}
									class="h-[58px] px-4 shrink-0"
								>
									添加
								</Button>
							</div>
						</div>

						{/* Result */}
						<Show when={sweepResult()}>
							{(res) => (
								<div class="p-2.5 border border-border bg-surface-container-low flex items-center justify-between text-xs">
									<span class="text-primary font-medium">
										本次发现: {res().total} 个视频
									</span>
									<span class="text-success font-semibold">
										+{res().tracked} 纳入追踪
									</span>
								</div>
							)}
						</Show>
					</CardContent>
				</Card>

				{/* Recommendation Graph Propagation */}
				<Card>
					<CardHeader title="关联推荐发现" />
					<CardContent class="p-4 flex flex-col gap-4">
						{/* Direct Seed Input */}
						<div class="flex items-end gap-3">
							<div class="flex-1">
								<TextField
									label="种子视频 (BVID 或 AID)"
									value={seedInput()}
									onInput={(e) => setSeedInput(e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void runSeedExpand();
										}
									}}
								/>
							</div>
							<Button
								variant="filled"
								disabled={runningSeedExpand() || !seedInput().trim()}
								onClick={() => void runSeedExpand()}
								class="h-[58px] px-6 shrink-0"
							>
								{runningSeedExpand() ? "扩散中..." : "推荐扩散"}
							</Button>
						</div>

						{/* Hot Seeds Global Expansion */}
						<div class="pt-3 border-t border-border flex items-center justify-between gap-3">
							<div class="flex flex-col">
								<span class="ts-label text-primary font-medium">热门推荐采样</span>
								<span class="ts-caption text-tertiary">
									遍历在库高增长视频关联推荐
								</span>
							</div>
							<Button
								variant="outlined"
								size="sm"
								disabled={runningHot()}
								onClick={() => void runHotSampling()}
								class="shrink-0"
							>
								{runningHot() ? "采样分析中..." : "采样热门推荐"}
							</Button>
						</div>

						{/* Strategy Indicators */}
						<div class="pt-3 border-t border-border flex items-center justify-between text-xs text-tertiary">
							<span>准入阈值: {filterConfig()?.modelThreshold ?? "0.70"}</span>
							<span>
								时长: {filterConfig()?.minDurationSeconds ?? 45}s -{" "}
								{filterConfig()?.maxDurationSeconds ?? 900}s
							</span>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Sub-view 1: Candidate Review Workbench */}
			<Show when={activeTab() === "review"}>
				<Card>
					<CardHeader
						title={
							<div class="flex items-center gap-3">
								<span>候选审查</span>
								<Badge variant="neutral" size="sm">
									{samples()?.total ?? 0}
								</Badge>
								<span class="text-xs text-tertiary font-normal hidden sm:inline">
									快捷键：[1] 确认曲目 [2] 标记非曲目 [J/K] 切换
								</span>
							</div>
						}
						actions={
							<div class="flex flex-wrap items-center gap-3">
								<div class="w-36">
									<Select
										label="判定过滤"
										options={decisionOptions}
										value={decisionFilter()}
										onValueChange={(val) => {
											if (val) {
												setDecisionFilter(val as SampleDecisionFilter);
												setPage(0);
												void loadSamples();
											}
										}}
									/>
								</div>
								<div class="w-36">
									<Select
										label="标注状态"
										options={labeledOptions}
										value={labeledFilter()}
										onValueChange={(val) => {
											if (val) {
												setLabeledFilter(val as SampleLabeledFilter);
												setPage(0);
												void loadSamples();
											}
										}}
									/>
								</div>
							</div>
						}
					/>
					<CardContent class="p-4 flex flex-col gap-4">
						<Show
							when={samples()?.items.length ? samples() : undefined}
							fallback={
								<div class="p-12 text-center text-tertiary text-sm flex flex-col items-center gap-3 bg-surface">
									<span>
										{loadingSamples()
											? "加载样本中..."
											: samplesError()
												? "无法获取候选数据，请检查网络或服务状态"
												: "暂无待审查候选视频"}
									</span>
									<Show when={!loadingSamples()}>
										<Button
											size="sm"
											variant="outlined"
											onClick={() => void loadSamples()}
										>
											刷新
										</Button>
									</Show>
								</div>
							}
						>
							{(current) => (
								<div class="flex flex-col gap-4">
									<div class="flex flex-col gap-2">
										<For each={current().items}>
											{(item, idx) => {
												const isFocused = () => focusedIndex() === idx();
												const isSong = () => item.humanLabel === 1;
												const isNonSong = () => item.humanLabel === 0;

												return (
													// biome-ignore lint/a11y/noStaticElementInteractions: focus row selection
													// biome-ignore lint/a11y/useKeyWithClickEvents: handled by global document keydown listener
													<div
														class={
															"p-3 border transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer " +
															(isFocused()
																? "border-primary bg-surface-container-low"
																: "border-border bg-surface hover:border-tertiary")
														}
														onClick={() => setFocusedIndex(idx())}
													>
														{/* Left: Thumbnail & Metadata */}
														<div class="flex items-start gap-3 min-w-0 flex-1">
															<span
																class={
																	"text-xs px-1.5 py-0.5 border shrink-0 " +
																	(isFocused()
																		? "bg-primary text-display-inverted border-primary font-bold"
																		: "bg-surface-container-high border-border text-tertiary")
																}
															>
																#{idx() + 1}
															</span>

															<Show
																when={item.pic}
																fallback={
																	<div class="w-24 h-15 bg-surface-container-high border border-border flex items-center justify-center text-[10px] text-tertiary shrink-0">
																		无封面
																	</div>
																}
															>
																{(pic) => (
																	<div class="relative w-24 h-15 shrink-0 border border-border overflow-hidden bg-black">
																		<img
																			src={pic()}
																			alt={item.title}
																			class="w-full h-full object-cover"
																			loading="lazy"
																			referrerPolicy="no-referrer"
																		/>
																	</div>
																)}
															</Show>

															<div class="flex flex-col gap-1 min-w-0 flex-1">
																<div class="flex flex-wrap items-center gap-2">
																	<span class="text-xs text-tertiary">
																		av{item.aid}
																	</span>
																	<a
																		href={`https://www.bilibili.com/video/${item.bvid}`}
																		target="_blank"
																		rel="noopener noreferrer"
																		class="text-xs text-primary hover:underline inline-flex items-center gap-1"
																		onClick={(e) =>
																			e.stopPropagation()
																		}
																	>
																		<span>{item.bvid}</span>
																		<ExternalLink class="w-3 h-3 text-tertiary" />
																	</a>
																	{decisionBadge(item.decision)}
																</div>

																<a
																	href={`https://www.bilibili.com/video/${item.bvid}`}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="font-medium text-sm text-primary hover:underline line-clamp-1"
																	title={item.title}
																	onClick={(e) =>
																		e.stopPropagation()
																	}
																>
																	{item.title}
																</a>

																{/* Model Score Progress */}
																<div class="flex items-center gap-2 max-w-xs pt-0.5">
																	<span class="text-xs text-tertiary shrink-0">
																		置信度:
																	</span>
																	<div class="flex-1 h-1.5 bg-surface-container-high border border-border overflow-hidden">
																		<div
																			class={
																				"h-full " +
																				(item.songProbability >=
																				0.7
																					? "bg-primary"
																					: "bg-tertiary")
																			}
																			style={{
																				width: `${Math.round(item.songProbability * 100)}%`,
																			}}
																		/>
																	</div>
																	<span class="text-xs font-medium text-primary">
																		{formatPercent(
																			item.songProbability
																		)}
																	</span>
																</div>
															</div>
														</div>

														{/* Right: Actions */}
														<div class="flex items-center gap-2 shrink-0 self-end md:self-center">
															<Button
																size="sm"
																variant={
																	isSong() ? "filled" : "outlined"
																}
																disabled={
																	labelingAid() === item.aid
																}
																onClick={(e) => {
																	e.stopPropagation();
																	void setHumanLabel(
																		item.aid,
																		true
																	);
																}}
																class={
																	"gap-1 text-xs " +
																	(isSong()
																		? "bg-primary text-display-inverted border-primary"
																		: "")
																}
															>
																<Check class="w-3.5 h-3.5" />
																<span>[1] 是曲目</span>
															</Button>

															<Button
																size="sm"
																variant={
																	isNonSong()
																		? "filled"
																		: "outlined"
																}
																disabled={
																	labelingAid() === item.aid
																}
																onClick={(e) => {
																	e.stopPropagation();
																	void setHumanLabel(
																		item.aid,
																		false
																	);
																}}
																class={
																	"gap-1 text-xs " +
																	(isNonSong()
																		? "bg-primary text-display-inverted border-primary"
																		: "")
																}
															>
																<X class="w-3.5 h-3.5" />
																<span>[2] 非曲目</span>
															</Button>
														</div>
													</div>
												);
											}}
										</For>
									</div>

									{/* Pagination */}
									<div class="flex items-center justify-between pt-3 border-t border-border text-xs text-secondary">
										<span>
											第 {page() + 1} 页 / 共{" "}
											{Math.ceil((current().total || 1) / pageSize)} 页
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
												<span>上一页</span>
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
												<span>下一页</span>
												<ChevronRight class="w-3.5 h-3.5" />
											</Button>
										</div>
									</div>
								</div>
							)}
						</Show>
					</CardContent>
				</Card>
			</Show>

			{/* Sub-view 2: Graph Explorer */}
			<Show when={activeTab() === "graph"}>
				<GraphExplorer onIngestSuccess={() => void loadSamples()} />
			</Show>
		</div>
	);
}
