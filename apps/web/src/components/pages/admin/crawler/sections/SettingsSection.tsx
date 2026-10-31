import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createMemo, createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import Switch from "@components/ui/Switch";
import Slider from "@components/ui/Slider";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoveryFilterConfigDto } from "@cvsa/contracts";
import KeywordListEditor from "./KeywordListEditor";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";
import { toDiscoveryConfigUpdatePayload } from "../discoveryConfig";
import Save from "lucide-solid/icons/save";

type KeywordField = "searchKeywords" | "whitelistSingers" | "whitelistSongIndicators";

function ModelParameters(props: {
	config: DiscoveryFilterConfigDto;
	onChange: (updates: Partial<DiscoveryFilterConfigDto>) => void;
}) {
	const t = getComponentT("crawler");
	return (
		<section class="flex flex-col gap-4">
			<h3 class="ts-heading-3 text-primary">{t("settings.parameters.title")}</h3>

			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex flex-col gap-1">
					<span class="ts-label font-medium text-primary">
						{t("settings.modelEnabled.title")}
					</span>
					<span class="ts-caption text-secondary">
						{t("settings.modelEnabled.description")}
					</span>
				</div>
				<Switch
					checked={props.config.modelEnabled}
					onChange={() =>
						props.onChange({
							modelEnabled: !props.config.modelEnabled,
						})
					}
					aria-label={t("settings.modelEnabled.title")}
				/>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Slider
					label={t("settings.threshold.title")}
					value={props.config.modelThreshold}
					min={0.1}
					max={0.99}
					step={0.01}
					formatValue={(val) => `${(val * 100).toFixed(0)}%`}
					onChange={(val) => props.onChange({ modelThreshold: val })}
				/>

				<Slider
					label={t("settings.sampleRate.title")}
					value={props.config.rejectionSampleRate}
					min={0}
					max={0.5}
					step={0.01}
					formatValue={(val) => `${(val * 100).toFixed(1)}%`}
					onChange={(val) => props.onChange({ rejectionSampleRate: val })}
				/>
			</div>
		</section>
	);
}

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
		if (loading() || saving() || isDirty()) return;
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
		if (!current) return false;
		const list = current[field] ?? [];
		if (list.includes(value)) return false;
		setConfig({ ...current, [field]: [...list, value] });
		return true;
	};

	const removeKeyword = (field: KeywordField, value: string) => {
		const current = config();
		if (!current) return;
		const list = current[field] ?? [];
		setConfig({ ...current, [field]: list.filter((item) => item !== value) });
	};

	const updateConfig = (updates: Partial<DiscoveryFilterConfigDto>) => {
		const current = config();
		if (current) setConfig({ ...current, ...updates });
	};

	const addIndicator = (value: string) => addKeyword("whitelistSongIndicators", value);
	const removeIndicator = (value: string) => removeKeyword("whitelistSongIndicators", value);

	useCrawlerRefresh("settings", () => void loadConfig());

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader
				title={<h2 class="ts-heading-2">{t("settings.title")}</h2>}
				actions={
					<>
						<Show when={isDirty()}>
							<span class="ts-caption text-secondary">
								{t("network.adapters.draftNotice")}
							</span>
						</Show>
						<Button
							size="sm"
							variant="filled"
							loading={saving()}
							disabled={loading() || !config() || !isDirty()}
							onClick={() => void saveConfig()}
							class="gap-1.5"
						>
							<Save class="w-3.5 h-3.5" />
							<span>{t("common.save")}</span>
						</Button>
					</>
				}
			/>

			<Show
				when={config()}
				fallback={
					<div class="p-10 text-center text-tertiary border border-border bg-surface">
						{loading() ? t("common.loading") : t("common.unknown")}
					</div>
				}
			>
				{(current) => (
					<fieldset disabled={saving()} class="min-w-0 border-0 p-0">
						<div class="flex flex-col gap-6">
							<KeywordListEditor
								title={t("settings.searchKeywords.title")}
								items={current().searchKeywords ?? []}
								placeholder={t("settings.searchKeywords.placeholder")}
								onAdd={(val) => addKeyword("searchKeywords", val)}
								onRemove={(val) => removeKeyword("searchKeywords", val)}
							/>

							<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
								<KeywordListEditor
									title={t("settings.singers.title")}
									items={current().whitelistSingers}
									placeholder={t("settings.singers.title")}
									onAdd={(val) => addKeyword("whitelistSingers", val)}
									onRemove={(val) => removeKeyword("whitelistSingers", val)}
								/>

								<KeywordListEditor
									title={t("settings.indicators.title")}
									items={current().whitelistSongIndicators}
									placeholder={t("settings.indicators.title")}
									onAdd={addIndicator}
									onRemove={removeIndicator}
								/>
							</div>

							<ModelParameters config={current()} onChange={updateConfig} />
						</div>
					</fieldset>
				)}
			</Show>
		</div>
	);
}
