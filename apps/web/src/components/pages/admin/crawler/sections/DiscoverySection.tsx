import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import Select, { type SelectOption } from "@components/ui/Select";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoveryFilterConfigDto, DiscoverySampleListResponse } from "@cvsa/contracts";
import Compass from "lucide-solid/icons/compass";
import ExternalLink from "lucide-solid/icons/external-link";
import Flame from "lucide-solid/icons/flame";
import Play from "lucide-solid/icons/play";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import Sliders from "lucide-solid/icons/sliders";
import Sparkles from "lucide-solid/icons/sparkles";
import {
	type SampleDecisionFilter,
	type SampleLabeledFilter,
	toSampleDecisionQuery,
	toSampleLabeledQuery,
} from "../discoveryFilters";
import { formatPercent } from "../format";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";
import { createRequestSequence } from "../videoActions";

const PAGE_SIZE = 10;

export default function DiscoverySection() {
	const t = getComponentT("crawler");

	// Search Sweep state
	const [keyword, setKeyword] = createSignal("");
	const [pagesPerQuery, setPagesPerQuery] = createSignal(2);
	const [runningSweep, setRunningSweep] = createSignal(false);
	const [sweepResult, setSweepResult] = createSignal<{ total: number; tracked: number } | null>(
		null
	);

	// Hot Sample state
	const [runningHotSample, setRunningHotSample] = createSignal(false);

	// Filter rules overview state
	const [filterConfig, setFilterConfig] = createSignal<DiscoveryFilterConfigDto | null>(null);

	// Samples state
	const [decisionFilter, setDecisionFilter] = createSignal<SampleDecisionFilter>("all");
	const [labeledFilter, setLabeledFilter] = createSignal<SampleLabeledFilter>("all");
	const [page, setPage] = createSignal(0);
	const [samples, setSamples] = createSignal<DiscoverySampleListResponse | null>(null);
	const [loadingSamples, setLoadingSamples] = createSignal(false);
	const [samplesError, setSamplesError] = createSignal<string | null>(null);
	const [labelingAid, setLabelingAid] = createSignal<string | null>(null);
	const sampleRequests = createRequestSequence();

	const loadFilterConfig = async () => {
		const res = await api.crawler.getDiscoveryConfig();
		if (res.ok && res.data) {
			setFilterConfig(res.data);
		}
	};

	const loadSamples = async () => {
		const request = sampleRequests.start();
		const decision = toSampleDecisionQuery(decisionFilter());
		const labeled = toSampleLabeledQuery(labeledFilter());
		setLoadingSamples(true);
		const res = await api.crawler.listDiscoverySamples({
			limit: PAGE_SIZE,
			offset: getPageOffset(page(), PAGE_SIZE),
			...(decision ? { decision } : {}),
			...(labeled === undefined ? {} : { labeled }),
		});
		if (!sampleRequests.isCurrent(request)) return;
		setLoadingSamples(false);
		if (!res.ok) {
			setSamplesError(res.error.message || t("common.error"));
			return;
		}
		if (!res.data) {
			setSamplesError(t("common.unknown"));
			return;
		}
		setSamplesError(null);
		setSamples(res.data);
	};

	const runSweep = async (customKeyword?: string) => {
		setRunningSweep(true);
		setSweepResult(null);
		const query = (customKeyword ?? keyword()).trim();
		const res = await api.crawler.triggerSweep({
			keywords: query ? [query] : undefined,
			pagesPerQuery: pagesPerQuery(),
		});
		setRunningSweep(false);
		if (res.ok && res.data) {
			setSweepResult({
				total: res.data.totalDiscovered,
				tracked: res.data.newTracked,
			});
			toast.success(
				t("discovery.sweep.summary")
					.replace("{total}", String(res.data.totalDiscovered))
					.replace("{tracked}", String(res.data.newTracked))
			);
			void loadSamples();
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const runHotSample = async () => {
		setRunningHotSample(true);
		const res = await api.crawler.triggerHotSample();
		setRunningHotSample(false);
		if (res.ok) {
			toast.success(t("discovery.hot.success"));
			void loadSamples();
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const setHumanLabel = async (aid: string, isSong: boolean) => {
		setLabelingAid(aid);
		const targetLabel: 0 | 1 = isSong ? 1 : 0;
		const res = await api.crawler.labelDiscoverySample(aid, targetLabel);
		setLabelingAid(null);
		if (res.ok && res.data) {
			const updatedItem = res.data;
			toast.success(t("discovery.samples.labelSuccess"));
			// Optimistically update list
			setSamples((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					items: prev.items.map((item) => (item.aid === aid ? updatedItem : item)),
				};
			});
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	onMount(() => {
		void loadFilterConfig();
		void loadSamples();
	});

	const decisionOptions: SelectOption[] = [
		{ value: "all", label: t("discovery.samples.decision.all") },
		{ value: "whitelist", label: t("discovery.samples.decision.whitelist") },
		{ value: "model_accepted", label: t("discovery.samples.decision.modelAccepted") },
		{
			value: "model_rejected_sampled",
			label: t("discovery.samples.decision.modelRejectedSampled"),
		},
	];

	const labeledOptions: SelectOption[] = [
		{ value: "all", label: t("discovery.samples.label.all") },
		{ value: "labeled", label: t("discovery.samples.label.labeled") },
		{ value: "unlabeled", label: t("discovery.samples.label.unlabeled") },
	];

	const presets = [
		{ label: t("discovery.sweep.preset.vocaloid"), query: "洛天依 原创" },
		{ label: t("discovery.sweep.preset.synthesizerV"), query: "Synthesizer V 原创" },
		{ label: t("discovery.sweep.preset.cevio"), query: "CeVIO 原创" },
		{ label: t("discovery.sweep.preset.ace"), query: "ACE Studio 原创" },
		{ label: t("discovery.sweep.preset.utau"), query: "UTAU 原创" },
	];

	const decisionBadge = (decision: string) => {
		switch (decision) {
			case "whitelist":
				return (
					<Badge variant="info" size="sm">
						{t("discovery.samples.decision.whitelist")}
					</Badge>
				);
			case "model_accepted":
				return (
					<Badge variant="success" size="sm">
						{t("discovery.samples.decision.modelAccepted")}
					</Badge>
				);
			case "model_rejected_sampled":
				return (
					<Badge variant="warning" size="sm">
						{t("discovery.samples.decision.modelRejectedSampled")}
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
			{/* Page Subtitle & Description */}
			<div class="bg-surface p-5 rounded-lg border border-border flex flex-col gap-2">
				<h2 class="ts-heading-2 text-primary flex items-center gap-2">
					<Compass class="w-5 h-5 text-primary" />
					<span>{t("discovery.title")}</span>
				</h2>
				<p class="ts-body text-secondary text-sm leading-relaxed max-w-4xl">
					{t("discovery.description")}
				</p>
			</div>

			{/* Operational Control Center: Sweep & Hot Sample */}
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Search Sweep Card */}
				<Card class="lg:col-span-2">
					<CardHeader
						title={
							<div class="flex items-center gap-2">
								<Search class="w-4 h-4 text-primary" />
								<span>{t("discovery.sweep.title")}</span>
							</div>
						}
					/>
					<CardContent class="flex flex-col gap-4">
						{/* Keyword input & Action */}
						<div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
							<div class="flex-1">
								<TextField
									label={t("discovery.sweep.keyword")}
									value={keyword()}
									onInput={(e) => setKeyword(e.currentTarget.value)}
								/>
							</div>

							<div class="w-32">
								<Select
									label={t("discovery.sweep.pages")}
									options={[
										{ value: "1", label: "1 page" },
										{ value: "2", label: "2 pages" },
										{ value: "3", label: "3 pages" },
										{ value: "5", label: "5 pages" },
									]}
									value={String(pagesPerQuery())}
									onValueChange={(val) =>
										setPagesPerQuery(Number.parseInt(val ?? "2", 10) || 2)
									}
								/>
							</div>

							<Button
								variant="filled"
								size="md"
								disabled={runningSweep()}
								onClick={() => void runSweep()}
								class="gap-2 shrink-0"
							>
								<Play class={"w-4 h-4 " + (runningSweep() ? "animate-spin" : "")} />
								<span>
									{runningSweep()
										? t("discovery.sweep.running")
										: t("discovery.sweep.trigger")}
								</span>
							</Button>
						</div>

						{/* Keyword Presets */}
						<div class="flex flex-wrap items-center gap-2 pt-1">
							<span class="ts-caption text-tertiary">
								{t("discovery.sweep.presets")}
							</span>
							<For each={presets}>
								{(preset) => (
									<button
										type="button"
										class="px-2.5 py-1 rounded-full text-xs border border-border bg-surface-container-high/40 text-secondary hover:text-primary hover:border-primary transition-colors select-none"
										onClick={() => {
											setKeyword(preset.query);
											void runSweep(preset.query);
										}}
									>
										{preset.label}
									</button>
								)}
							</For>
						</div>

						{/* Sweep Result Banner */}
						<Show when={sweepResult()}>
							{(res) => (
								<div class="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between text-sm">
									<div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
										<Sparkles class="w-4 h-4" />
										<span>
											{t("discovery.sweep.summary")
												.replace("{total}", String(res().total))
												.replace("{tracked}", String(res().tracked))}
										</span>
									</div>
									<Badge variant="success" size="sm">
										+{res().tracked} Tracked
									</Badge>
								</div>
							)}
						</Show>
					</CardContent>
				</Card>

				{/* Hot Sample & Filter Rules Card */}
				<Card>
					<CardHeader
						title={
							<div class="flex items-center gap-2">
								<Flame class="w-4 h-4 text-amber-500" />
								<span>{t("discovery.hot.title")}</span>
							</div>
						}
					/>
					<CardContent class="flex flex-col gap-4">
						<p class="ts-caption text-tertiary">{t("discovery.hot.description")}</p>

						<Button
							variant="outlined"
							size="md"
							disabled={runningHotSample()}
							onClick={() => void runHotSample()}
							class="gap-2 w-full justify-center"
						>
							<Flame
								class={
									"w-4 h-4 text-amber-500 " +
									(runningHotSample() ? "animate-spin" : "")
								}
							/>
							<span>
								{runningHotSample()
									? t("discovery.hot.running")
									: t("discovery.hot.trigger")}
							</span>
						</Button>

						{/* Filter Rules Summary */}
						<div class="pt-3 border-t border-border flex flex-col gap-2">
							<span class="ts-caption font-medium text-secondary flex items-center gap-1.5">
								<Sliders class="w-3.5 h-3.5 text-tertiary" />
								<span>{t("discovery.filterSummary.title")}</span>
							</span>
							<div class="grid grid-cols-2 gap-2 text-xs">
								<div class="p-2 rounded bg-surface-container-high/30 border border-border">
									<span class="text-tertiary block">
										{t("discovery.filterSummary.threshold")}
									</span>
									<span class="font-mono font-medium text-primary">
										P &ge; {filterConfig()?.modelThreshold ?? "0.70"}
									</span>
								</div>
								<div class="p-2 rounded bg-surface-container-high/30 border border-border">
									<span class="text-tertiary block">
										{t("discovery.filterSummary.duration")}
									</span>
									<span class="font-mono font-medium text-primary">
										{filterConfig()?.minDurationSeconds ?? 45}s -{" "}
										{filterConfig()?.maxDurationSeconds ?? 900}s
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Candidate Evaluation Samples Table */}
			<Card>
				<CardHeader
					title={t("discovery.samples.title")}
					description={
						samples() ? `${t("common.total")} ${samples()?.total ?? 0}` : undefined
					}
					actions={
						<div class="flex flex-wrap items-center gap-2">
							<div class="w-48">
								<Select
									label={t("discovery.samples.filterDecision")}
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
							<div class="w-40">
								<Select
									label={t("discovery.samples.filterLabel")}
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
							<Button
								size="sm"
								variant="outlined"
								disabled={loadingSamples()}
								onClick={() => void loadSamples()}
								class="gap-1.5"
							>
								<RefreshCw
									class={
										"w-3.5 h-3.5 " + (loadingSamples() ? "animate-spin" : "")
									}
								/>
								<span>
									{loadingSamples()
										? t("common.refreshing")
										: t("common.refresh")}
								</span>
							</Button>
						</div>
					}
				/>
				<CardContent class="p-0">
					<Show
						when={samples()}
						fallback={
							<div class="p-12 text-center text-tertiary">
								{loadingSamples()
									? t("common.loading")
									: (samplesError() ?? t("discovery.samples.empty"))}
							</div>
						}
					>
						{(current) => (
							<div class="flex flex-col">
								<Show
									when={current().items.length > 0}
									fallback={
										<div class="p-12 text-center text-tertiary">
											{t("discovery.samples.empty")}
										</div>
									}
								>
									<div class="overflow-x-auto">
										<table class="w-full text-left ts-caption">
											<thead>
												<tr class="border-b border-border text-tertiary bg-surface-container-high/30">
													<th class="py-3 px-4 font-medium">
														{t("discovery.samples.col.aid")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("discovery.samples.col.bvid")}
													</th>
													<th class="py-3 px-4 font-medium min-w-[200px]">
														{t("discovery.samples.col.title")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("discovery.samples.col.decision")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("discovery.samples.col.probability")}
													</th>
													<th class="py-3 px-4 font-medium">
														{t("discovery.samples.col.label")}
													</th>
													<th class="py-3 px-4 font-medium text-right">
														{t("discovery.samples.col.action")}
													</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-border">
												<For each={current().items}>
													{(item) => (
														<tr class="hover:bg-hover transition-colors">
															<td class="py-3 px-4 font-mono font-medium text-primary">
																{item.aid}
															</td>
															<td class="py-3 px-4 font-mono">
																<a
																	href={`https://www.bilibili.com/video/${item.bvid}`}
																	target="_blank"
																	rel="noopener noreferrer"
																	class="text-primary hover:underline inline-flex items-center gap-1"
																>
																	<span>{item.bvid}</span>
																	<ExternalLink class="w-3 h-3 text-tertiary" />
																</a>
															</td>
															<td
																class="py-3 px-4 max-w-sm truncate text-secondary"
																title={item.title}
															>
																{item.title}
															</td>
															<td class="py-3 px-4">
																{decisionBadge(item.decision)}
															</td>
															<td class="py-3 px-4 font-mono">
																<span
																	class={
																		item.songProbability >= 0.7
																			? "text-emerald-600 dark:text-emerald-400 font-semibold"
																			: "text-secondary"
																	}
																>
																	{formatPercent(
																		item.songProbability
																	)}
																</span>
															</td>
															<td class="py-3 px-4">
																<Show
																	when={item.humanLabel !== null}
																	fallback={
																		<Badge
																			variant="neutral"
																			size="sm"
																		>
																			{t(
																				"discovery.samples.label.unlabeled"
																			)}
																		</Badge>
																	}
																>
																	<Badge
																		variant={
																			item.humanLabel === 1
																				? "success"
																				: "danger"
																		}
																		size="sm"
																	>
																		{item.humanLabel === 1
																			? t(
																					"discovery.samples.label.isSong"
																				)
																			: t(
																					"discovery.samples.label.isNonSong"
																				)}
																	</Badge>
																</Show>
															</td>
															<td class="py-3 px-4 text-right">
																<div class="inline-flex items-center gap-1.5">
																	<Button
																		size="sm"
																		variant={
																			item.humanLabel === 1
																				? "filled"
																				: "outlined"
																		}
																		disabled={
																			labelingAid() ===
																			item.aid
																		}
																		onClick={() =>
																			void setHumanLabel(
																				item.aid,
																				true
																			)
																		}
																		class="text-xs px-2 h-7"
																	>
																		{t(
																			"discovery.samples.label.markSong"
																		)}
																	</Button>
																	<Button
																		size="sm"
																		variant={
																			item.humanLabel === 0
																				? "filled"
																				: "outlined"
																		}
																		disabled={
																			labelingAid() ===
																			item.aid
																		}
																		onClick={() =>
																			void setHumanLabel(
																				item.aid,
																				false
																			)
																		}
																		class="text-xs px-2 h-7"
																	>
																		{t(
																			"discovery.samples.label.markNonSong"
																		)}
																	</Button>
																</div>
															</td>
														</tr>
													)}
												</For>
											</tbody>
										</table>
									</div>
								</Show>

								{/* Pagination */}
								<div class="px-5 py-3 border-t border-border flex items-center justify-between">
									<span class="ts-caption text-tertiary">
										{formatPageLabel(page(), PAGE_SIZE, current().total)}
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
										>
											{t("common.previous")}
										</Button>
										<Button
											size="sm"
											variant="outlined"
											disabled={
												!hasNextPage(page(), PAGE_SIZE, current().total) ||
												loadingSamples()
											}
											onClick={() => {
												setPage((p) => p + 1);
												void loadSamples();
											}}
										>
											{t("common.next")}
										</Button>
									</div>
								</div>
							</div>
						)}
					</Show>
				</CardContent>
			</Card>
		</div>
	);
}
