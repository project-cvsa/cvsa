import { createMemo, createSignal, onMount, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	CrawlerStatusDto,
	HealthConfig,
	NetworkAdapterConfig,
	NetworkRuntimeConfig,
	NetworkRuntimeConfigDocument,
} from "@cvsa/contracts";
import NetworkAdapterForm from "../network/NetworkAdapterForm";
import NetworkAdapterList from "../network/NetworkAdapterList";
import NetworkHealthPolicy from "../network/NetworkHealthPolicy";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";
import NetworkIcon from "lucide-solid/icons/network";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Save from "lucide-solid/icons/save";
import AlertTriangle from "lucide-solid/icons/alert-triangle";

type NetworkSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
	loadingStatus: Accessor<boolean>;
	refreshStatus: () => Promise<void>;
};

/**
 * Ensures that the 'bilibili-api' request type is always bound to all enabled adapters.
 * This prevents crawler requests from failing with NO_AVAILABLE_ADAPTER.
 */
function synchronizeBindings(config: NetworkRuntimeConfig): NetworkRuntimeConfig {
	const enabledIds = config.adapters.filter((a) => a.enabled).map((a) => a.id);
	const existingBindings = config.bindings ?? [];
	const hasBiliBinding = existingBindings.some((b) => b.requestType === "bilibili-api");

	const bindings = hasBiliBinding
		? existingBindings.map((b) =>
				b.requestType === "bilibili-api"
					? { ...b, adapterIds: enabledIds.length > 0 ? enabledIds : b.adapterIds }
					: b
			)
		: enabledIds.length > 0
			? [...existingBindings, { requestType: "bilibili-api", adapterIds: enabledIds }]
			: existingBindings;

	return {
		...config,
		bindings,
	};
}

export default function NetworkSection(props: NetworkSectionProps) {
	const t = getComponentT("crawler");

	const [networkDoc, setNetworkDoc] = createSignal<NetworkRuntimeConfigDocument | null>(null);
	const [savedSnapshot, setSavedSnapshot] = createSignal<string>("");
	const [loading, setLoading] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const [configMissing, setConfigMissing] = createSignal(false);
	const requests = createConfigRequestCoordinator();

	const isDirty = createMemo(() => {
		const doc = networkDoc();
		if (!doc || !savedSnapshot()) return false;
		return JSON.stringify(doc.config) !== savedSnapshot();
	});

	const loadConfig = async () => {
		if (loading() || saving()) return;
		const request = requests.beginLoad();
		setLoading(true);
		const res = await api.crawler.getNetworkConfig();
		if (!requests.canApplyLoad(request)) return;
		setLoading(false);
		if (!res.ok) {
			if (res.status === 404) {
				setConfigMissing(true);
				setNetworkDoc(null);
				return;
			}
			toast.error(res.error.message || t("common.error"));
			return;
		}
		if (!res.data) {
			toast.error(t("common.unknown"));
			return;
		}
		setConfigMissing(false);
		setNetworkDoc(res.data);
		setSavedSnapshot(JSON.stringify(res.data.config));
	};

	const initializeConfig = async () => {
		if (loading() || saving()) return;
		const request = requests.beginSave();
		setSaving(true);
		const initialConfig: NetworkRuntimeConfig = {
			adapters: [
				{
					type: "direct",
					id: "direct-default",
					enabled: true,
					baseWeight: 1,
					rateLimits: [],
				},
			],
			bindings: [
				{
					requestType: "bilibili-api",
					adapterIds: ["direct-default"],
				},
			],
			requestTypePolicies: {},
		};

		const res = await api.crawler.updateNetworkConfig({
			revision: 0,
			config: initialConfig,
		});
		if (!requests.canApplySave(request)) return;
		setSaving(false);
		if (res.ok && res.data) {
			setConfigMissing(false);
			setNetworkDoc(res.data);
			setSavedSnapshot(JSON.stringify(res.data.config));
			toast.success(t("common.success"));
			void props.refreshStatus();
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const saveConfig = async () => {
		if (loading() || saving()) return;
		const current = networkDoc();
		if (!current) return;

		const synchronizedConfig = synchronizeBindings(current.config);

		const request = requests.beginSave();
		setSaving(true);
		const res = await api.crawler.updateNetworkConfig({
			revision: current.revision,
			config: synchronizedConfig,
		});
		if (!requests.canApplySave(request)) return;
		setSaving(false);
		if (res.ok && res.data) {
			setNetworkDoc((latest) => applySaveResult(latest, current, res.data));
			setSavedSnapshot(JSON.stringify(res.data.config));
			toast.success(t("common.saved"));
			void props.refreshStatus();
			return;
		}
		toast.error(res.ok ? t("common.error") : res.error.message || t("common.error"));
	};

	const addAdapter = (adapter: NetworkAdapterConfig): boolean => {
		const current = networkDoc();
		if (!current) return false;
		if (current.config.adapters.some((item) => item.id === adapter.id)) {
			toast.error(t("network.form.idHelper"));
			return false;
		}
		setNetworkDoc({
			...current,
			config: { ...current.config, adapters: [...current.config.adapters, adapter] },
		});
		return true;
	};

	const toggleAdapter = (id: string) => {
		const current = networkDoc();
		if (!current) return;
		setNetworkDoc({
			...current,
			config: {
				...current.config,
				adapters: current.config.adapters.map((adapter) =>
					adapter.id === id ? { ...adapter, enabled: !adapter.enabled } : adapter
				),
			},
		});
	};

	const removeAdapter = (id: string) => {
		const current = networkDoc();
		if (!current) return;
		setNetworkDoc({
			...current,
			config: {
				...current.config,
				adapters: current.config.adapters.filter((adapter) => adapter.id !== id),
			},
		});
		toast.info(t("common.delete"));
	};

	const updateWeight = (id: string, weight: number) => {
		const current = networkDoc();
		if (!current) return;
		setNetworkDoc({
			...current,
			config: {
				...current.config,
				adapters: current.config.adapters.map((adapter) =>
					adapter.id === id ? { ...adapter, baseWeight: Math.max(0.1, weight) } : adapter
				),
			},
		});
	};

	const updateHealth = (health: HealthConfig) => {
		const current = networkDoc();
		if (!current) return;
		setNetworkDoc({
			...current,
			config: {
				...current.config,
				health,
			},
		});
	};

	onMount(() => {
		void loadConfig();
	});

	return (
		<div class="flex flex-col gap-6">
			{/* Page Subtitle & Description */}
			<div class="bg-surface p-5 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex flex-col gap-1.5">
					<h2 class="ts-heading-2 text-primary flex items-center gap-2">
						<NetworkIcon class="w-5 h-5 text-primary" />
						<span>{t("network.title")}</span>
						<Show when={networkDoc()}>
							{(doc) => (
								<Badge variant="neutral" size="sm">
									Rev {doc().revision}
								</Badge>
							)}
						</Show>
					</h2>
					<p class="ts-body text-secondary text-sm leading-relaxed max-w-3xl">
						{t("network.description")}
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
						disabled={loading() || saving() || !networkDoc() || !isDirty()}
						onClick={() => void saveConfig()}
						class="gap-1.5"
					>
						<Save class={"w-3.5 h-3.5 " + (saving() ? "animate-spin" : "")} />
						<span>
							{saving() ? t("common.saving") : t("network.adapters.saveChanges")}
						</span>
					</Button>
				</div>
			</div>

			{/* Unsaved Draft Changes Alert */}
			<Show when={isDirty()}>
				<div class="p-4 border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 animate-pulse">
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
						<span>
							{saving() ? t("common.saving") : t("network.adapters.saveChanges")}
						</span>
					</Button>
				</div>
			</Show>

			<Show
				when={networkDoc()}
				fallback={
					<div class="p-10 text-center text-tertiary border border-border flex flex-col items-center gap-4 bg-surface">
						<span>
							{loading()
								? t("common.loading")
								: configMissing()
									? t("network.adapters.empty")
									: "无法获取网络适配器配置"}
						</span>
						<Show when={configMissing() && !loading()}>
							<Button
								size="sm"
								variant="filled"
								disabled={loading() || saving()}
								onClick={() => void initializeConfig()}
							>
								{saving() ? t("common.saving") : t("network.adapters.add")}
							</Button>
						</Show>
						<Show when={!configMissing() && !loading()}>
							<Button
								size="sm"
								variant="outlined"
								disabled={loading()}
								onClick={() => void loadConfig()}
							>
								重试
							</Button>
						</Show>
					</div>
				}
			>
				{(doc) => (
					<fieldset disabled={loading() || saving()} class="min-w-0 border-0 p-0">
						<div class="flex flex-col gap-6">
							<NetworkAdapterList
								adapters={doc().config.adapters}
								status={props.statusData()}
								onToggle={toggleAdapter}
								onRemove={removeAdapter}
								onWeightChange={updateWeight}
							/>

							<NetworkAdapterForm onAdd={addAdapter} />

							<NetworkHealthPolicy
								config={doc().config.health}
								onChange={updateHealth}
							/>
						</div>
					</fieldset>
				)}
			</Show>
		</div>
	);
}
