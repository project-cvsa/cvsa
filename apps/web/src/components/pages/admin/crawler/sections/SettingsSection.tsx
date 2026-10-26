import { createSignal, onMount, Show } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type { DiscoveryFilterConfigDto } from "@cvsa/contracts";
import KeywordListEditor from "./KeywordListEditor";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";
import { toDiscoveryConfigUpdatePayload } from "../discoveryConfig";

type KeywordField = "whitelistSingers" | "whitelistSongIndicators" | "blacklistKeywords";

export default function SettingsSection() {
	const [config, setConfig] = createSignal<DiscoveryFilterConfigDto | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const requests = createConfigRequestCoordinator();

	const loadConfig = async () => {
		if (loading() || saving()) return;
		const request = requests.beginLoad();
		setLoading(true);
		const res = await api.crawler.getDiscoveryConfig();
		if (!requests.canApplyLoad(request)) return;
		setLoading(false);
		if (res.ok && res.data) {
			setConfig(res.data);
			return;
		}
		toast.error(res.ok ? "No configuration" : res.error.message || "Could not load settings");
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
			toast.success("Settings saved");
			return;
		}
		toast.error(res.ok ? "Save failed" : res.error.message || "Could not save settings");
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
		<div class="flex flex-col gap-4">
			<div class="flex items-center justify-between gap-3">
				<h2 class="ts-heading-2 text-primary">Discovery settings</h2>
				<div class="flex gap-2">
					<Button
						size="sm"
						variant="outlined"
						disabled={loading() || saving()}
						onClick={() => void loadConfig()}
					>
						{loading() ? "Loading" : "Reload"}
					</Button>
					<Button
						size="sm"
						variant="filled"
						disabled={loading() || saving() || !config()}
						onClick={() => void saveConfig()}
					>
						{saving() ? "Saving" : "Save"}
					</Button>
				</div>
			</div>

			<Show
				when={config()}
				fallback={
					<div class="p-8 text-center text-tertiary border border-border rounded">
						{loading() ? "Loading" : "No settings"}
					</div>
				}
			>
				{(current) => (
					<fieldset disabled={loading() || saving()} class="min-w-0 border-0 p-0">
						<div class="flex flex-col gap-4">
							<KeywordListEditor
								title="Singer whitelist"
								items={current().whitelistSingers}
								placeholder="Singer name"
								onAdd={(value) => addKeyword("whitelistSingers", value)}
								onRemove={(value) => removeKeyword("whitelistSingers", value)}
							/>
							<KeywordListEditor
								title="Song indicators"
								items={current().whitelistSongIndicators}
								placeholder="Indicator keyword"
								onAdd={(value) => addKeyword("whitelistSongIndicators", value)}
								onRemove={(value) =>
									removeKeyword("whitelistSongIndicators", value)
								}
							/>
							<KeywordListEditor
								title="Blacklist"
								items={current().blacklistKeywords}
								placeholder="Keyword"
								onAdd={(value) => addKeyword("blacklistKeywords", value)}
								onRemove={(value) => removeKeyword("blacklistKeywords", value)}
							/>

							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div class="p-4 rounded border border-border flex flex-col gap-2">
									<label
										class="ts-label text-primary font-medium"
										for="crawler-min-duration"
									>
										Min duration (s)
									</label>
									<input
										id="crawler-min-duration"
										type="number"
										min="1"
										class="h-10 px-3 border border-border rounded text-primary bg-transparent"
										value={current().minDurationSeconds}
										onInput={(event) =>
											updateConfig({
												minDurationSeconds:
													Number.parseInt(
														event.currentTarget.value,
														10
													) || 0,
											})
										}
									/>
								</div>
								<div class="p-4 rounded border border-border flex flex-col gap-2">
									<label
										class="ts-label text-primary font-medium"
										for="crawler-max-duration"
									>
										Max duration (s)
									</label>
									<input
										id="crawler-max-duration"
										type="number"
										min="1"
										class="h-10 px-3 border border-border rounded text-primary bg-transparent"
										value={current().maxDurationSeconds}
										onInput={(event) =>
											updateConfig({
												maxDurationSeconds:
													Number.parseInt(
														event.currentTarget.value,
														10
													) || 0,
											})
										}
									/>
								</div>
								<div class="p-4 rounded border border-border flex flex-col gap-2">
									<label
										class="ts-label text-primary font-medium"
										for="crawler-rejection-rate"
									>
										Rejection sample ·{" "}
										{Math.round(current().rejectionSampleRate * 100)}%
									</label>
									<input
										id="crawler-rejection-rate"
										type="range"
										min="0"
										max="1"
										step="0.01"
										class="h-10"
										value={current().rejectionSampleRate}
										onInput={(event) =>
											updateConfig({
												rejectionSampleRate:
													Number.parseFloat(event.currentTarget.value) ||
													0,
											})
										}
									/>
								</div>
							</div>

							<div class="p-4 rounded border border-border flex flex-col gap-3">
								<div class="flex items-center justify-between gap-3">
									<h3 class="ts-subhead font-semibold text-primary">
										Classifier
									</h3>
									<label class="flex items-center gap-2 ts-caption text-primary">
										<input
											type="checkbox"
											checked={current().modelEnabled}
											onChange={(event) =>
												updateConfig({
													modelEnabled: event.currentTarget.checked,
												})
											}
										/>
										Enabled
									</label>
								</div>
								<label
									class="ts-label text-primary font-medium"
									for="crawler-model-threshold"
								>
									Acceptance threshold · {current().modelThreshold.toFixed(2)}
								</label>
								<input
									id="crawler-model-threshold"
									type="range"
									min="0"
									max="1"
									step="0.01"
									class="h-10"
									disabled={!current().modelEnabled}
									value={current().modelThreshold}
									onInput={(event) =>
										updateConfig({
											modelThreshold:
												Number.parseFloat(event.currentTarget.value) || 0,
										})
									}
								/>
							</div>
						</div>
					</fieldset>
				)}
			</Show>
		</div>
	);
}
