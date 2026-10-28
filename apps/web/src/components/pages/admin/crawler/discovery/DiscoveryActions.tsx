import { For, Show, type Accessor } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import Select from "@components/ui/Select";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoveryFilterConfigDto } from "@cvsa/contracts";
import Search from "lucide-solid/icons/search";
import GitFork from "lucide-solid/icons/git-fork";
import Flame from "lucide-solid/icons/flame";

type DiscoveryActionsProps = {
	keyword: Accessor<string>;
	setKeyword: (value: string) => void;
	pagesPerQuery: Accessor<number>;
	setPagesPerQuery: (value: number) => void;
	runningSweep: Accessor<boolean>;
	runSweep: (word?: string) => Promise<void>;
	configuredKeywords: Accessor<string[]>;
	sweepResult: Accessor<{ total: number; tracked: number } | null>;
	seedInput: Accessor<string>;
	setSeedInput: (value: string) => void;
	runningSeedExpand: Accessor<boolean>;
	runSeedExpand: () => Promise<void>;
	runningHot: Accessor<boolean>;
	runHotSampling: () => Promise<void>;
	filterConfig: Accessor<DiscoveryFilterConfigDto | null>;
	onNavigateSettings?: () => void;
};

export default function DiscoveryActions(props: DiscoveryActionsProps) {
	const t = getComponentT("crawler");

	return (
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{/* Card 1: Keyword Rover Sweep */}
			<div class="bg-surface border border-border p-4 flex flex-col justify-between gap-4">
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between border-b border-border pb-2">
						<div class="flex items-center gap-2">
							<Search class="w-4 h-4 text-tertiary" />
							<span class="text-xs font-semibold text-primary uppercase tracking-wider">
								{t("discoveryUi.keywordDiscovery")}
							</span>
						</div>
						<Show when={props.sweepResult()}>
							{(res) => (
								<span class="text-xs text-secondary font-mono">
									{t("discoveryUi.discovered")}:{" "}
									<strong class="text-primary">{res().total}</strong> ·{" "}
									{t("discoveryUi.tracked")}:{" "}
									<strong class="text-primary">{res().tracked}</strong>
								</span>
							)}
						</Show>
					</div>

					<div class="flex items-center gap-2">
						<div class="flex-1 min-w-0">
							<TextField
								size="sm"
								placeholder="输入关键词进行搜索探索..."
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
						<div class="w-32 shrink-0">
							<Select
								size="sm"
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
							size="sm"
							variant="filled"
							loading={props.runningSweep()}
							onClick={() => void props.runSweep()}
							class="shrink-0 px-4 gap-1.5"
						>
							<Search class="w-3.5 h-3.5" />
							<span>{t("discoveryUi.search")}</span>
						</Button>
					</div>
				</div>

				{/* Quick Presets / Lexicon Tags */}
				<div class="flex flex-col gap-1.5 pt-3 border-t border-border">
					<div class="flex items-center justify-between text-xs text-tertiary">
						<span class="font-medium">常用探索词预设：</span>
						<Show when={props.onNavigateSettings}>
							<button
								type="button"
								onClick={props.onNavigateSettings}
								class="text-secondary hover:text-primary transition-colors cursor-pointer"
							>
								配置词库 →
							</button>
						</Show>
					</div>
					<div class="flex flex-wrap items-center gap-1.5">
						<For
							each={props.configuredKeywords()}
							fallback={
								<span class="text-tertiary text-xs">
									{t("discoveryUi.defaultKeywords")}
								</span>
							}
						>
							{(word) => (
								<button
									type="button"
									onClick={() => {
										props.setKeyword(word);
										void props.runSweep(word);
									}}
									class="px-2 py-0.5 bg-surface-container-high border border-border text-xs text-primary hover:border-primary/50 hover:bg-hover transition-colors cursor-pointer select-none"
									title={`以「${word}」执行抓取`}
								>
									{word}
								</button>
							)}
						</For>
					</div>
				</div>
			</div>

			{/* Card 2: Seed Graph Expansion & Hot Video Sampling */}
			<div class="bg-surface border border-border p-4 flex flex-col justify-between gap-4">
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between border-b border-border pb-2">
						<div class="flex items-center gap-2">
							<GitFork class="w-4 h-4 text-tertiary" />
							<span class="text-xs font-semibold text-primary uppercase tracking-wider">
								{t("discoveryUi.relatedDiscovery")}
							</span>
						</div>
						<span class="text-xs text-tertiary">通过推荐拓扑扩散发现</span>
					</div>

					<div class="flex items-center gap-2">
						<div class="flex-1 min-w-0">
							<TextField
								size="sm"
								placeholder={t("discoveryUi.seed")}
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
							size="sm"
							variant="filled"
							loading={props.runningSeedExpand()}
							onClick={() => void props.runSeedExpand()}
							class="shrink-0 px-3 gap-1.5"
						>
							<GitFork class="w-3.5 h-3.5" />
							<span>{t("discoveryUi.expand")}</span>
						</Button>
					</div>
				</div>

				<div class="flex items-center justify-between gap-4 pt-3 border-t border-border">
					<div class="flex flex-col">
						<span class="text-xs font-medium text-primary">高增长热门推荐采样</span>
						<span class="text-xs text-tertiary">遍历在库高增长歌曲的关联推荐池</span>
					</div>
					<Button
						size="sm"
						variant="outlined"
						loading={props.runningHot()}
						onClick={() => void props.runHotSampling()}
						class="gap-1.5 shrink-0"
					>
						<Flame class="w-3.5 h-3.5 text-warning" />
						<span>{t("discoveryUi.sampleHot")}</span>
					</Button>
				</div>
			</div>
		</div>
	);
}
