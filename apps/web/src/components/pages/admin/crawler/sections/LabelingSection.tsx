import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Select from "@components/ui/Select";
import TextField from "@components/ui/TextField";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoverySampleListQuery, DiscoverySampleListResponse } from "@cvsa/contracts";
import { createRequestSequence } from "../videoActions";
import {
	toSampleDecisionQuery,
	toSampleLabeledQuery,
	type SampleDecisionFilter,
	type SampleLabeledFilter,
} from "../discoveryFilters";
import Pagination from "../TablePagination";
import DiscoveryCandidate from "../discovery/DiscoveryCandidate";

export default function LabelingSection(props: { active: boolean }) {
	const t = getComponentT("crawler");

	const [samples, setSamples] = createSignal<DiscoverySampleListResponse | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [decision, setDecision] = createSignal<SampleDecisionFilter>("all");
	const [labeled, setLabeled] = createSignal<SampleLabeledFilter>("unlabeled");
	const [source, setSource] = createSignal<DiscoverySampleListQuery["source"]>();
	const [search, setSearch] = createSignal("");
	const [appliedSearch, setAppliedSearch] = createSignal("");
	const [confidence, setConfidence] = createSignal("all");
	const [sort, setSort] = createSignal("capturedAt_desc");
	const [page, setPage] = createSignal(0);
	const [focused, setFocused] = createSignal(0);
	const [labeling, setLabeling] = createSignal<string | null>(null);
	const requests = createRequestSequence();
	const PAGE_SIZE = 15;
	const loadSamples = async () => {
		const request = requests.start();
		setLoading(true);
		const query: DiscoverySampleListQuery = {
			limit: PAGE_SIZE,
			offset: page() * PAGE_SIZE,
			decision: toSampleDecisionQuery(decision()),
			labeled: toSampleLabeledQuery(labeled()),
			search: appliedSearch().trim() || undefined,
			source: source(),
			minConfidence: confidence() === "high" ? 0.8 : undefined,
			maxConfidence: confidence() === "low" ? 0.5 : undefined,
			sortBy: sort().startsWith("confidence")
				? "confidence"
				: sort().startsWith("aid")
					? "aid"
					: "capturedAt",
			sortOrder: sort().endsWith("asc") ? "asc" : "desc",
		};
		const result = await api.crawler.listDiscoverySamples(query);
		if (!requests.isCurrent(request)) return;
		setLoading(false);
		if (result.ok && result.data) {
			const selectedAid = samples()?.items[focused()]?.aid;
			const index = result.data.items.findIndex((item) => item.aid === selectedAid);
			setSamples(result.data);
			setError(null);
			setFocused(index < 0 ? 0 : index);
			if (page() > 0 && page() * PAGE_SIZE >= result.data.total) {
				setPage(Math.max(0, Math.ceil(result.data.total / PAGE_SIZE) - 1));
				void loadSamples();
			}
		} else setError(result.ok ? t("common.error") : result.error.message || t("common.error"));
	};
	const filterChanged = () => {
		setPage(0);
		void loadSamples();
	};
	const label = async (aid: string, isSong: boolean) => {
		if (labeling()) return;
		setLabeling(aid);
		const result = await api.crawler.labelDiscoverySample(aid, isSong ? 1 : 0);
		setLabeling(null);
		if (result.ok) {
			toast.success(t("common.saved"));
			void loadSamples();
		} else toast.error(result.error.message || t("common.error"));
	};
	onMount(() => {
		const keydown = (event: KeyboardEvent) => {
			if (!props.active || event.ctrlKey || event.metaKey || event.altKey) return;
			if (
				event.target instanceof Element &&
				event.target.closest(
					"input,textarea,select,button,[role=combobox],[contenteditable=true]"
				)
			)
				return;
			const items = samples()?.items ?? [];
			if (!items.length) return;
			if (["j", "ArrowDown", "k", "ArrowUp"].includes(event.key)) {
				event.preventDefault();
				setFocused((index) =>
					Math.max(
						0,
						Math.min(
							items.length - 1,
							index + (["j", "ArrowDown"].includes(event.key) ? 1 : -1)
						)
					)
				);
			} else if (event.key === "1" || event.key === "2") {
				event.preventDefault();
				const item = items[focused()];
				if (item) void label(item.aid, event.key === "1");
			}
		};
		window.addEventListener("keydown", keydown);
		onCleanup(() => {
			window.removeEventListener("keydown", keydown);
		});
	});
	useCrawlerRefresh("labeling", () => {
		if (!labeling() && !loading()) void loadSamples();
	});
	const options = (values: string[], prefix: string) =>
		values.map((value) => ({ value, label: t(`${prefix}.${value}`) }));
	return (
		<div class="flex flex-col gap-6">
			<SectionHeader title={<h2 class="ts-heading-2">{t("tabs.labeling")}</h2>} />
			<section class="flex flex-col gap-3" aria-label={t("discoveryUi.review")}>
				<form
					class="flex flex-wrap items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						setAppliedSearch(search());
						filterChanged();
					}}
				>
					<TextField
						size="sm"
						class="w-56"
						aria-label={t("audit.search")}
						placeholder={t("audit.search")}
						value={search()}
						onInput={(event) => setSearch(event.currentTarget.value)}
					/>
					<Button size="sm" variant="outlined" type="submit">
						{t("common.search")}
					</Button>
					<div class="w-40">
						<Select
							size="sm"
							aria-label={t("audit.decision")}
							options={options(
								["all", "whitelist", "model_accepted", "model_rejected_sampled"],
								"audit.decisions"
							)}
							value={decision()}
							onValueChange={(value) => {
								if (
									value === "all" ||
									value === "whitelist" ||
									value === "model_accepted" ||
									value === "model_rejected_sampled"
								) {
									setDecision(value);
									filterChanged();
								}
							}}
						/>
					</div>
					<div class="w-32">
						<Select
							size="sm"
							aria-label={t("audit.label")}
							options={options(["all", "unlabeled", "labeled"], "audit.labels")}
							value={labeled()}
							onValueChange={(value) => {
								if (
									value === "all" ||
									value === "unlabeled" ||
									value === "labeled"
								) {
									setLabeled(value);
									filterChanged();
								}
							}}
						/>
					</div>
					<div class="w-32">
						<Select
							size="sm"
							aria-label={t("audit.source")}
							options={options(
								["all", "search", "related", "manual", "hot_sample"],
								"audit.sources"
							)}
							value={source() ?? "all"}
							onValueChange={(value) => {
								if (
									value === "search" ||
									value === "related" ||
									value === "manual" ||
									value === "hot_sample" ||
									value === "all"
								) {
									setSource(value === "all" ? undefined : value);
									filterChanged();
								}
							}}
						/>
					</div>
					<div class="w-36">
						<Select
							size="sm"
							aria-label={t("discoveryUi.confidence")}
							options={options(["all", "high", "low"], "audit.confidence")}
							value={confidence()}
							onValueChange={(value) => {
								setConfidence(value ?? "all");
								filterChanged();
							}}
						/>
					</div>
					<div class="w-40">
						<Select
							size="sm"
							aria-label={t("audit.sort")}
							options={options(
								[
									"capturedAt_desc",
									"capturedAt_asc",
									"confidence_desc",
									"confidence_asc",
									"aid_desc",
								],
								"audit.sorts"
							)}
							value={sort()}
							onValueChange={(value) => {
								setSort(value ?? "capturedAt_desc");
								filterChanged();
							}}
						/>
					</div>
				</form>
				<Show when={error()}>
					{(message) => (
						<p role="alert" class="text-error text-label tracking-label">
							{message()}
						</p>
					)}
				</Show>
				<div
					class="cvsa-scroll overflow-x-auto border border-border bg-surface"
					aria-busy={loading()}
				>
					<div class="min-w-[1000px]">
						<For
							each={samples()?.items}
							fallback={
								<p class="p-8 text-center text-tertiary text-label tracking-label">
									{loading() ? t("common.loading") : t("discoveryUi.noSamples")}
								</p>
							}
						>
							{(item, index) => (
								<DiscoveryCandidate
									item={item}
									index={index()}
									focused={focused() === index()}
									busy={labeling() !== null}
									onFocus={() => setFocused(index())}
									onLabel={(isSong) => void label(item.aid, isSong)}
								/>
							)}
						</For>
					</div>
				</div>
				<Pagination
					page={page()}
					total={samples()?.total ?? 0}
					pageSize={PAGE_SIZE}
					busy={loading()}
					onPageChange={(next) => {
						setPage(next);
						void loadSamples();
					}}
				/>
			</section>
		</div>
	);
}
