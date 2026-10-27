import { createMemo, createSignal, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import Switch from "@components/ui/Switch";
import NumberField from "@components/ui/NumberField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoveryFilterConfigDto } from "@cvsa/contracts";
import KeywordListEditor from "./KeywordListEditor";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";
import { toDiscoveryConfigUpdatePayload } from "../discoveryConfig";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Save from "lucide-solid/icons/save";
import AlertTriangle from "lucide-solid/icons/alert-triangle";
import Cpu from "lucide-solid/icons/cpu";

type KeywordField = "whitelistSingers" | "whitelistSongIndicators" | "blacklistKeywords";

export default function SettingsSection() {
	const t = getComponentT("crawler");

	const [config, setConfig] = createSignal<DiscoveryFilterConfigDto | null>(null);
	const [savedSnapshot, setSavedSnapshot] = createSignal<string>("");
	const [loading, setLoading] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const requests = createConfigRequestCoordinator();

	const isDirty = createMemo(() => {
		const cur = config();
		if (!cur || !savedSnapshot()) return false;
		return JSON.stringify(cur) !== savedSnapshot();
	});

	const loadConfig = async () => {
		if (loading() || saving()) return;
		const request = requests.beginLoad();
		setLoading(true);
		const res = await api.crawler.getDiscoveryConfig();
		if (!requests.canApplyLoad(request)) return;
		setLoading(false);
		if (res.ok && res.data) {
			setConfig(res.data);
			setSavedSnapshot(JSON.stringify(res.data));
			return;
		}
		toast.error(res.ok ? t("common.unknown") : res.error.message || t("common.error"));
	};

	const saveConfig = async () => {
		if (loading() || saving()) return;
		const current = config();
		if (!current) return;
		const request = requests.beginSave();
		setSaving(true);
		const res = await api.crawler.updateDiscoveryConfig(
			toDiscoveryConfigUpdatePayload(current)
		);
		if (!requests.canApplySave(request)) return;
		setSaving(false);
		if (res.ok && res.data) {
			setConfig((latest) => applySaveResult(latest, current, res.data));
			setSavedSnapshot(JSON.stringify(res.data));
			toast.success(t("common.saved"));
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const addKeyword = (field: KeywordField, value: string): boolean => {
		const current = config();
		if (!current || current[field].includes(value)) return false;
		setConfig({ ...current, [field]: [...current[field], value] });
		return true;
	};

	const removeKeyword = (field: KeywordField, value: string) => {
		const current = config();
		if (!current) return;
		setConfig({ ...current, [field]: current[field].filter((item) => item !== value) });
	};

	const updateConfig = (updates: Partial<DiscoveryFilterConfigDto>) => {
		const current = config();
		if (current) setConfig({ ...current, ...updates });
	};

	onMount(() => {
		void loadConfig();
	});

	return (
		<div class="flex flex-col gap-6">
			{/* Page Subtitle & Description */}
			<div class="bg-surface p-5 rounded-lg border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex flex-col gap-1.5">
					<h2 class="ts-heading-2 text-primary flex items-center gap-2">
						<SlidersHorizontal class="w-5 h-5 text-primary" />
						<span>{t("settings.title")}</span>
					</h2>
					<p class="ts-body text-secondary text-sm leading-relaxed max-w-3xl">
						{t("settings.description")}
					</p>
				</div>

				<div class="flex items-center gap-2 shrink-0">
					<Button
						size="sm"
						variant="outlined"
						disabled={loading() || saving()}
						onClick={() => void loadConfig()}
						class="gap-1.5"
					>
						<RefreshCw class={"w-3.5 h-3.5 " + (loading() ? "animate-spin" : "")} />
						<span>{loading() ? t("common.refreshing") : t("common.refresh")}</span>
					</Button>
					<Button
						size="sm"
						variant="filled"
						disabled={loading() || saving() || !config() || !isDirty()}
						onClick={() => void saveConfig()}
						class="gap-1.5"
					>
						<Save class={"w-3.5 h-3.5 " + (saving() ? "animate-spin" : "")} />
						<span>{saving() ? t("common.saving") : t("common.save")}</span>
					</Button>
				</div>
			</div>

			{/* Unsaved Draft Alert */}
			<Show when={isDirty()}>
				<div class="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 animate-pulse">
					<div class="flex items-center gap-2.5 text-amber-700 dark:text-amber-300">
						<AlertTriangle class="w-4 h-4 shrink-0" />
						<span class="text-sm font-medium">{t("network.adapters.draftNotice")}</span>
					</div>
					<Button
						size="sm"
						variant="filled"
						disabled={saving()}
						onClick={() => void saveConfig()}
						class="gap-1.5 shrink-0"
					>
						<Save class="w-3.5 h-3.5" />
						<span>{saving() ? t("common.saving") : t("common.save")}</span>
					</Button>
				</div>
			</Show>

			<Show
				when={config()}
				fallback={
					<div class="p-10 text-center text-tertiary border border-border rounded-lg bg-surface">
						{loading() ? t("common.loading") : t("common.unknown")}
					</div>
				}
			>
				{(current) => (
					<fieldset disabled={loading() || saving()} class="min-w-0 border-0 p-0">
						<div class="flex flex-col gap-6">
							{/* Keyword Lists */}
							<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
								<KeywordListEditor
									title={t("settings.singers.title")}
									description={t("settings.singers.description")}
									items={current().whitelistSingers}
									placeholder={t("settings.singers.title")}
									onAdd={(val) => addKeyword("whitelistSingers", val)}
									onRemove={(val) => removeKeyword("whitelistSingers", val)}
								/>

								<KeywordListEditor
									title={t("settings.indicators.title")}
									description={t("settings.indicators.description")}
									items={current().whitelistSongIndicators}
									placeholder={t("settings.indicators.title")}
									onAdd={(val) => addKeyword("whitelistSongIndicators", val)}
									onRemove={(val) =>
										removeKeyword("whitelistSongIndicators", val)
									}
								/>

								<KeywordListEditor
									title={t("settings.blacklist.title")}
									description={t("settings.blacklist.description")}
									items={current().blacklistKeywords}
									placeholder={t("settings.blacklist.title")}
									onAdd={(val) => addKeyword("blacklistKeywords", val)}
									onRemove={(val) => removeKeyword("blacklistKeywords", val)}
								/>
							</div>

							{/* Numerical Parameters & AI Model Configuration */}
							<Card>
								<CardHeader
									title={
										<div class="flex items-center gap-2">
											<Cpu class="w-4 h-4 text-primary" />
											<span>{t("settings.parameters.title")}</span>
										</div>
									}
								/>
								<CardContent class="flex flex-col gap-6">
									{/* Model Enable Toggle */}
									<div class="p-4 rounded-lg border border-border bg-surface-container-low/50 flex items-center justify-between gap-4">
										<div class="flex flex-col gap-1">
											<span class="ts-label font-medium text-primary">
												{t("settings.modelEnabled.title")}
											</span>
											<span class="ts-caption text-secondary">
												{t("settings.modelEnabled.description")}
											</span>
										</div>
										<Switch
											checked={current().modelEnabled}
											onChange={() =>
												updateConfig({
													modelEnabled: !current().modelEnabled,
												})
											}
											aria-label={t("settings.modelEnabled.title")}
										/>
									</div>

									{/* Numerical Fields Grid */}
									<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
										<NumberField
											label={t("settings.threshold.title")}
											min={0}
											max={1}
											step={0.05}
											value={current().modelThreshold}
											onChange={(val) =>
												updateConfig({ modelThreshold: val })
											}
											helperText={t("settings.threshold.description")}
										/>

										<NumberField
											label={t("settings.duration.min")}
											min={1}
											value={current().minDurationSeconds}
											onChange={(val) =>
												updateConfig({ minDurationSeconds: val })
											}
											suffix="s"
										/>

										<NumberField
											label={t("settings.duration.max")}
											min={1}
											value={current().maxDurationSeconds}
											onChange={(val) =>
												updateConfig({ maxDurationSeconds: val })
											}
											suffix="s"
										/>

										<NumberField
											label={t("settings.sampleRate.title")}
											min={0}
											max={1}
											step={0.01}
											value={current().rejectionSampleRate}
											onChange={(val) =>
												updateConfig({ rejectionSampleRate: val })
											}
											helperText={t("settings.sampleRate.description")}
										/>
									</div>
								</CardContent>
							</Card>
						</div>
					</fieldset>
				)}
			</Show>
		</div>
	);
}
