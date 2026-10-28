import { For, Show, type Accessor } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import Select from "@components/ui/Select";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoveryFilterConfigDto } from "@cvsa/contracts";
import X from "lucide-solid/icons/x";

type DiscoveryActionsProps = {
	keyword: Accessor<string>;
	setKeyword: (value: string) => void;
	pagesPerQuery: Accessor<number>;
	setPagesPerQuery: (value: number) => void;
	runningSweep: Accessor<boolean>;
	runSweep: (word?: string) => Promise<void>;
	configuredKeywords: Accessor<string[]>;
	removeConfigKeyword: (word: string) => Promise<void>;
	newKeywordInput: Accessor<string>;
	setNewKeywordInput: (value: string) => void;
	savingKeywords: Accessor<boolean>;
	addConfigKeyword: (word: string) => Promise<void>;
	sweepResult: Accessor<{ total: number; tracked: number } | null>;
	seedInput: Accessor<string>;
	setSeedInput: (value: string) => void;
	runningSeedExpand: Accessor<boolean>;
	runSeedExpand: () => Promise<void>;
	runningHot: Accessor<boolean>;
	runHotSampling: () => Promise<void>;
	filterConfig: Accessor<DiscoveryFilterConfigDto | null>;
};

export default function DiscoveryActions(props: DiscoveryActionsProps) {
	const t = getComponentT("crawler");
	return (
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			{/* Keyword Rover & Lexicon */}
			<Card>
				<CardHeader title={t("discoveryUi.keywordDiscovery")} />
				<CardContent class="p-4 flex flex-col gap-4">
					{/* Trigger Search */}
					<div class="flex flex-col gap-3">
						<div class="flex-1">
							<TextField
								label={t("discoveryUi.keyword")}
								value={props.keyword()}
								onInput={(e) => props.setKeyword(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										void props.runSweep();
									}
								}}
							/>
						</div>

						<div>
							<Select
								label={t("discoveryUi.depth")}
								options={[
									{ value: "1", label: t("discoveryUi.page1") },
									{ value: "2", label: t("discoveryUi.page2") },
									{ value: "3", label: t("discoveryUi.page3") },
									{ value: "5", label: t("discoveryUi.page5") },
								]}
								value={String(props.pagesPerQuery())}
								onValueChange={(val) =>
									props.setPagesPerQuery(Number.parseInt(val ?? "2", 10) || 2)
								}
							/>
						</div>

						<Button
							variant="filled"
							disabled={props.runningSweep()}
							onClick={() => void props.runSweep()}
							class="self-start"
						>
							{props.runningSweep()
								? t("discoveryUi.searching")
								: t("discoveryUi.search")}
						</Button>
					</div>

					{/* Keywords List */}
					<div class="flex flex-col gap-2 pt-3 border-t border-border">
						<div class="flex items-center justify-between text-xs">
							<span class="font-medium text-secondary">
								{t("discoveryUi.keywords")} ({props.configuredKeywords().length})
							</span>
							<span class="text-tertiary">{t("discoveryUi.clickSearch")}</span>
						</div>

						<div class="flex flex-wrap items-center gap-1.5 min-h-[30px]">
							<For
								each={props.configuredKeywords()}
								fallback={
									<span class="text-tertiary text-xs">
										{t("discoveryUi.defaultKeywords")}
									</span>
								}
							>
								{(word) => (
									<div class="inline-flex items-center gap-1 px-2 py-0.5 border border-border bg-surface-container-low text-xs group hover:border-primary transition-colors">
										<button
											type="button"
											class="text-primary hover:underline cursor-pointer"
											title={t("discoveryUi.searchKeyword")}
											onClick={() => {
												props.setKeyword(word);
												void props.runSweep(word);
											}}
										>
											{word}
										</button>
										<button
											type="button"
											class="text-tertiary hover:text-error ml-0.5 cursor-pointer"
											title={t("discoveryUi.removeKeyword")}
											onClick={() => void props.removeConfigKeyword(word)}
										>
											<X class="w-3 h-3" />
										</button>
									</div>
								)}
							</For>
						</div>

						{/* Add keyword form */}
						<div class="flex flex-col items-start gap-2 pt-1">
							<div class="w-full">
								<TextField
									label={t("discoveryUi.addKeyword")}
									value={props.newKeywordInput()}
									onInput={(e) => props.setNewKeywordInput(e.currentTarget.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void props.addConfigKeyword(props.newKeywordInput());
										}
									}}
								/>
							</div>
							<Button
								size="md"
								variant="outlined"
								disabled={props.savingKeywords() || !props.newKeywordInput().trim()}
								onClick={() => void props.addConfigKeyword(props.newKeywordInput())}
								class="shrink-0"
							>
								{t("discoveryUi.add")}
							</Button>
						</div>
					</div>

					{/* Result */}
					<Show when={props.sweepResult()}>
						{(res) => (
							<div class="p-2.5 border border-border bg-surface-container-low flex items-center justify-between text-xs">
								<span class="text-primary font-medium">
									{t("discoveryUi.discovered")}: {res().total}
								</span>
								<span class="text-primary font-semibold">
									+{res().tracked} {t("discoveryUi.tracked")}
								</span>
							</div>
						)}
					</Show>
				</CardContent>
			</Card>

			{/* Recommendation Graph Propagation */}
			<Card>
				<CardHeader title={t("discoveryUi.relatedDiscovery")} />
				<CardContent class="p-4 flex flex-col gap-4">
					{/* Direct Seed Input */}
					<div class="flex flex-col gap-3">
						<div class="flex-1">
							<TextField
								label={t("discoveryUi.seed")}
								value={props.seedInput()}
								onInput={(e) => props.setSeedInput(e.currentTarget.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										void props.runSeedExpand();
									}
								}}
							/>
						</div>
						<Button
							variant="filled"
							disabled={props.runningSeedExpand() || !props.seedInput().trim()}
							onClick={() => void props.runSeedExpand()}
							class="self-start"
						>
							{props.runningSeedExpand()
								? t("discoveryUi.expanding")
								: t("discoveryUi.expand")}
						</Button>
					</div>

					{/* Hot Seeds Global Expansion */}
					<div class="pt-3 border-t border-border flex items-center justify-between gap-3">
						<div class="flex flex-col">
							<span class="ts-label text-primary font-medium">
								{t("discoveryUi.hotSampling")}
							</span>
							<span class="ts-caption text-tertiary">
								{t("discoveryUi.hotDescription")}
							</span>
						</div>
						<Button
							variant="outlined"
							size="sm"
							disabled={props.runningHot()}
							onClick={() => void props.runHotSampling()}
							class="shrink-0"
						>
							{props.runningHot()
								? t("discoveryUi.sampling")
								: t("discoveryUi.sampleHot")}
						</Button>
					</div>

					{/* Strategy Indicators */}
					<div class="pt-3 border-t border-border flex items-center justify-between text-xs text-tertiary">
						<span>
							{t("discoveryUi.threshold")}:{" "}
							{props.filterConfig()?.modelThreshold ?? "0.70"}
						</span>
						<span>
							{t("discoveryUi.duration")}:{" "}
							{props.filterConfig()?.minDurationSeconds ?? 45}s -{" "}
							{props.filterConfig()?.maxDurationSeconds ?? 900}s
						</span>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
