import { createMemo, createSignal, Show } from "solid-js";
import type { NetworkRuntimeConfigDocument } from "@cvsa/contracts";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { useCrawlerRefresh } from "../refresh";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";
import CrawlerExecutionPolicy from "./CrawlerExecutionPolicy";

export default function ExecutionSettings() {
	const t = getComponentT("crawler");
	const [document, setDocument] = createSignal<NetworkRuntimeConfigDocument | null>(null);
	const [saved, setSaved] = createSignal<string>();
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const requests = createConfigRequestCoordinator();
	const dirty = createMemo(() => JSON.stringify(document()?.config.execution) !== saved());
	const load = async () => {
		if (saving() || (document() && dirty())) return;
		const request = requests.beginLoad();
		const response = await api.crawler.getNetworkConfig();
		if (!requests.canApplyLoad(request)) return;
		if (response.ok && response.data) {
			setDocument(response.data);
			setSaved(JSON.stringify(response.data.config.execution));
			setError(null);
		} else
			setError(
				response.ok
					? t("network.adapters.empty")
					: response.error.message || t("common.error")
			);
	};
	const save = async () => {
		const submitted = document();
		if (!submitted || saving()) return;
		const request = requests.beginSave();
		setSaving(true);
		const response = await api.crawler.updateNetworkConfig({
			revision: submitted.revision,
			config: submitted.config,
		});
		if (!requests.canApplySave(request)) return;
		setSaving(false);
		if (response.ok && response.data) {
			setDocument((current) => applySaveResult(current, submitted, response.data));
			setSaved(JSON.stringify(response.data.config.execution));
			toast.success(t("common.saved"));
		} else
			toast.error(
				response.ok ? t("common.error") : response.error.message || t("common.error")
			);
	};
	useCrawlerRefresh("settings", () => void load());
	return (
		<section class="flex flex-col gap-4 border-t border-border pt-6">
			<div class="flex items-center justify-between gap-3">
				<h3 class="ts-heading-3">{t("network.execution.title")}</h3>
				<Button
					size="sm"
					loading={saving()}
					disabled={!document() || !dirty()}
					onClick={() => void save()}
				>
					{t("common.save")}
				</Button>
			</div>
			<Show when={error()}>
				{(message) => (
					<p role="alert" class="ts-caption text-error">
						{message()}
					</p>
				)}
			</Show>
			<Show when={document()}>
				{(current) => (
					<fieldset disabled={saving()} class="border-0 p-0 min-w-0">
						<CrawlerExecutionPolicy
							config={current().config.execution}
							onChange={(execution) =>
								setDocument({
									...current(),
									config: { ...current().config, execution },
								})
							}
						/>
					</fieldset>
				)}
			</Show>
		</section>
	);
}
