import { createSignal, For, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type { DiscoverySampleItem, DiscoverySampleListResponse } from "@cvsa/contracts";
import {
	type SampleDecisionFilter,
	type SampleLabeledFilter,
	toSampleDecisionQuery,
	toSampleLabeledQuery,
} from "../discoveryFilters";
import { formatPercent } from "../format";
import { describeDecision, describeHumanLabel } from "../labels";
import { formatPageLabel, getPageOffset, hasNextPage } from "../pagination";
import { createRequestSequence } from "../videoActions";

const PAGE_SIZE = 10;

const DECISION_OPTIONS: ReadonlyArray<{ value: SampleDecisionFilter; label: string }> = [
	{ value: "all", label: "All decisions" },
	{ value: "whitelist", label: "Whitelist" },
	{ value: "model_accepted", label: "Model accepted" },
	{ value: "model_rejected_sampled", label: "Model rejected (sampled)" },
];

const LABELED_OPTIONS: ReadonlyArray<{ value: SampleLabeledFilter; label: string }> = [
	{ value: "all", label: "All labels" },
	{ value: "labeled", label: "Labeled" },
	{ value: "unlabeled", label: "Unlabeled" },
];

function parseDecision(value: string): SampleDecisionFilter {
	switch (value) {
		case "whitelist":
		case "model_accepted":
		case "model_rejected_sampled":
			return value;
		default:
			return "all";
	}
}

function parseLabeled(value: string): SampleLabeledFilter {
	return value === "labeled" || value === "unlabeled" ? value : "all";
}

export default function DiscoverySection() {
	const [keyword, setKeyword] = createSignal("");
	const [running, setRunning] = createSignal(false);
	const [sweepResult, setSweepResult] = createSignal<string | null>(null);
	const [decisionFilter, setDecisionFilter] = createSignal<SampleDecisionFilter>("all");
	const [labeledFilter, setLabeledFilter] = createSignal<SampleLabeledFilter>("all");
	const [page, setPage] = createSignal(0);
	const [samples, setSamples] = createSignal<DiscoverySampleListResponse | null>(null);
	const [loadingSamples, setLoadingSamples] = createSignal(false);
	const [samplesError, setSamplesError] = createSignal<string | null>(null);
	const [labelingAid, setLabelingAid] = createSignal<string | null>(null);
	const sampleRequests = createRequestSequence();

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
			setSamplesError(res.error.message || "Could not load samples");
			return;
		}
		if (!res.data) {
			setSamplesError("No samples");
			return;
		}
		setSamplesError(null);
		setSamples(res.data);
	};

	const runSweep = async () => {
		setRunning(true);
		setSweepResult(null);
		const value = keyword().trim();
		const res = await api.crawler.triggerSweep({
			keywords: value ? [value] : undefined,
			pagesPerQuery: 2,
		});
		setRunning(false);
		if (res.ok && res.data) {
			setSweepResult(
				"Discovered " + res.data.totalDiscovered + " · tracked " + res.data.newTracked
			);
			toast.success("Sweep complete");
			void loadSamples();
			return;
		}
		toast.error(res.ok ? "Sweep failed" : res.error.message || "Sweep failed");
	};

	const labelSample = async (item: DiscoverySampleItem, humanLabel: 0 | 1) => {
		if (labelingAid() !== null) return;
		setLabelingAid(item.aid);
		const res = await api.crawler.labelDiscoverySample(item.aid, humanLabel);
		setLabelingAid(null);
		if (!res.ok || !res.data) {
			toast.error(res.ok ? "Label failed" : res.error.message || "Could not label sample");
			return;
		}
		const updated = res.data;
		setSamples((current) =>
			current === null
				? current
				: {
						...current,
						items: current.items.map((sample) =>
							sample.aid === updated.aid ? updated : sample
						),
					}
		);
		toast.success("Sample labeled");
	};

	const changeDecision = (value: string) => {
		setDecisionFilter(parseDecision(value));
		setPage(0);
		void loadSamples();
	};

	const changeLabeled = (value: string) => {
		setLabeledFilter(parseLabeled(value));
		setPage(0);
		void loadSamples();
	};

	const goToPage = (next: number) => {
		setPage(next);
		void loadSamples();
	};

	const sampleTags = (item: DiscoverySampleItem): string[] => item.tags;

	onMount(() => {
		void loadSamples();
	});

	return (
		<div class="flex flex-col gap-6">
			<div class="flex flex-col gap-4">
				<h2 class="ts-heading-2 text-primary">Discovery</h2>
				<div class="p-4 rounded border border-border flex flex-col gap-4">
					<div class="flex flex-wrap items-center gap-3">
						<label class="ts-label text-primary" for="crawler-sweep-keyword">
							Keyword
						</label>
						<input
							id="crawler-sweep-keyword"
							type="text"
							class="h-10 px-3 border border-border rounded text-primary bg-transparent w-60 text-sm"
							placeholder="Default keyword set"
							value={keyword()}
							onInput={(event) => setKeyword(event.currentTarget.value)}
						/>
						<Button
							size="sm"
							variant="filled"
							disabled={running()}
							onClick={() => void runSweep()}
						>
							{running() ? "Running" : "Run sweep"}
						</Button>
					</div>
					<Show when={sweepResult()}>
						{(summary) => (
							<div class="text-sm text-primary border-t border-border pt-3">
								{summary()}
							</div>
						)}
					</Show>
				</div>
			</div>

			<section class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="ts-subhead font-semibold text-primary">Samples</h3>
					<div class="flex flex-wrap items-center gap-2">
						<label class="ts-caption text-tertiary" for="crawler-sample-decision">
							Decision
						</label>
						<select
							id="crawler-sample-decision"
							class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
							value={decisionFilter()}
							onChange={(event) => changeDecision(event.currentTarget.value)}
						>
							<For each={DECISION_OPTIONS}>
								{(option) => <option value={option.value}>{option.label}</option>}
							</For>
						</select>
						<label class="ts-caption text-tertiary" for="crawler-sample-labeled">
							Label
						</label>
						<select
							id="crawler-sample-labeled"
							class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
							value={labeledFilter()}
							onChange={(event) => changeLabeled(event.currentTarget.value)}
						>
							<For each={LABELED_OPTIONS}>
								{(option) => <option value={option.value}>{option.label}</option>}
							</For>
						</select>
						<Button
							size="sm"
							variant="outlined"
							disabled={loadingSamples()}
							onClick={() => void loadSamples()}
						>
							{loadingSamples() ? "Refreshing" : "Refresh"}
						</Button>
					</div>
				</div>

				<Show
					when={samples()}
					fallback={
						<div class="p-6 text-center text-tertiary border border-border rounded">
							{loadingSamples()
								? "Loading"
								: samplesError() !== null
									? samplesError()
									: "No samples"}
						</div>
					}
				>
					{(current) => (
						<div class="flex flex-col gap-3">
							<Show
								when={current().items.length > 0}
								fallback={
									<div class="p-6 text-center text-tertiary border border-border rounded">
										No matching samples
									</div>
								}
							>
								<div class="overflow-x-auto border border-border rounded">
									<table class="w-full text-left ts-caption">
										<thead>
											<tr class="border-b border-border text-tertiary">
												<th class="py-2 px-3">AID</th>
												<th class="py-2 px-3">BVID</th>
												<th class="py-2 px-3">Title</th>
												<th class="py-2 px-3">Tags</th>
												<th class="py-2 px-3">Decision</th>
												<th class="py-2 px-3">Model</th>
												<th class="py-2 px-3">Song p</th>
												<th class="py-2 px-3">Label</th>
												<th class="py-2 px-3">Action</th>
											</tr>
										</thead>
										<tbody>
											<For each={current().items}>
												{(item) => (
													<tr class="border-b border-border hover:bg-hover">
														<td class="py-2 px-3 font-mono font-medium text-primary">
															{item.aid}
														</td>
														<td class="py-2 px-3 font-mono text-tertiary">
															{item.bvid}
														</td>
														<td class="py-2 px-3 text-secondary max-w-60 truncate">
															{item.title}
														</td>
														<td class="py-2 px-3">
															<div class="flex flex-wrap gap-1 max-w-60">
																<For
																	each={sampleTags(item).slice(
																		0,
																		3
																	)}
																>
																	{(tag) => (
																		<span class="px-1.5 py-0.5 rounded bg-hover text-tertiary border border-border">
																			{tag}
																		</span>
																	)}
																</For>
																<Show
																	when={
																		sampleTags(item).length > 3
																	}
																>
																	<span class="px-1.5 py-0.5 text-tertiary">
																		+
																		{sampleTags(item).length -
																			3}
																	</span>
																</Show>
															</div>
														</td>
														<td class="py-2 px-3 text-secondary">
															{describeDecision(item.decision)}
														</td>
														<td class="py-2 px-3 font-mono text-tertiary">
															{item.modelVersion}
														</td>
														<td class="py-2 px-3">
															{formatPercent(item.songProbability)}
														</td>
														<td class="py-2 px-3">
															{describeHumanLabel(item.humanLabel)}
														</td>
														<td class="py-2 px-3">
															<div class="flex gap-1">
																<Button
																	size="sm"
																	variant={
																		item.humanLabel === 1
																			? "filled"
																			: "outlined"
																	}
																	disabled={
																		labelingAid() === item.aid
																	}
																	onClick={() =>
																		void labelSample(item, 1)
																	}
																>
																	Song
																</Button>
																<Button
																	size="sm"
																	variant={
																		item.humanLabel === 0
																			? "filled"
																			: "outlined"
																	}
																	disabled={
																		labelingAid() === item.aid
																	}
																	onClick={() =>
																		void labelSample(item, 0)
																	}
																>
																	Not song
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

							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="ts-caption text-tertiary">
									{formatPageLabel(page(), current().total, PAGE_SIZE)}
								</span>
								<div class="flex gap-2">
									<Button
										size="sm"
										variant="outlined"
										disabled={loadingSamples() || page() === 0}
										onClick={() => goToPage(page() - 1)}
									>
										Previous
									</Button>
									<Button
										size="sm"
										variant="outlined"
										disabled={
											loadingSamples() ||
											!hasNextPage(page(), current().total, PAGE_SIZE)
										}
										onClick={() => goToPage(page() + 1)}
									>
										Next
									</Button>
								</div>
							</div>
						</div>
					)}
				</Show>
			</section>
		</div>
	);
}
