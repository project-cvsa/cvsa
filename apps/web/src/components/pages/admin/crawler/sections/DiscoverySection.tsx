import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Select, { type SelectOption } from "@components/ui/Select";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { createRequestSequence } from "../videoActions";
import type { DiscoveryFilterConfigDto, DiscoverySampleListResponse } from "@cvsa/contracts";
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

	const addConfigKeyword = async (word: string) => {
		const clean = word.trim();
		if (!clean) return;

		const current = filterConfig()?.searchKeywords ?? [];
		if (current.includes(clean)) {
			toast.error(t("discoveryUi.duplicateKeyword"));
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
			toast.success(`${t("discoveryUi.keywordAdded")}: ${clean}`);
			return;
		}
		toast.error(t("discoveryUi.keywordsFailed"));
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
			toast.success(`${t("discoveryUi.keywordRemoved")}: ${word}`);
			return;
		}
		toast.error(t("discoveryUi.keywordsFailed"));
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
			<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<span class="ts-heading-3 text-primary font-semibold">
						{t("discoveryUi.title")}
					</span>
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
							{t("discoveryUi.review")}
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
							{t("discoveryUi.graph")}
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
						<span>{t("discoveryUi.refresh")}</span>
					</Button>
				</div>
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
					removeConfigKeyword={removeConfigKeyword}
					newKeywordInput={newKeywordInput}
					setNewKeywordInput={setNewKeywordInput}
					savingKeywords={savingKeywords}
					addConfigKeyword={addConfigKeyword}
					sweepResult={sweepResult}
					seedInput={seedInput}
					setSeedInput={setSeedInput}
					runningSeedExpand={runningSeedExpand}
					runSeedExpand={runSeedExpand}
					runningHot={runningHot}
					runHotSampling={runHotSampling}
					filterConfig={filterConfig}
				/>
			</Show>

			{/* Sub-view 1: Candidate Review Workbench */}
			<Show when={activeTab() === "review"}>
				<Card>
					<CardHeader
						title={
							<div class="flex items-center gap-3">
								<span>{t("discoveryUi.review")}</span>
								<Badge variant="neutral" size="sm">
									{samples()?.total ?? 0}
								</Badge>
								<span class="text-xs text-tertiary font-normal hidden sm:inline">
									{t("discoveryUi.shortcuts")}
								</span>
							</div>
						}
						actions={
							<div class="flex flex-wrap items-center gap-3">
								<div class="w-36">
									<Select
										label={t("discoveryUi.decisionFilter")}
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
								<div class="w-36">
									<Select
										label={t("discoveryUi.labelFilter")}
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
								<div class="flex flex-col gap-4">
									<div class="flex flex-col gap-2">
										<For each={current().items}>
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

									{/* Pagination */}
									<div class="flex items-center justify-between pt-3 border-t border-border text-xs text-secondary">
										<span>
											{page() + 1} /{" "}
											{Math.ceil((current().total || 1) / pageSize)}
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
