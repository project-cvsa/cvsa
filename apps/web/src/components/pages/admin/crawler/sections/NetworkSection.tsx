import NetworkSessionPolicy from "../network/NetworkSessionPolicy";
import { useCrawlerRefresh } from "../refresh";
import SectionHeader from "../SectionHeader";
import { createMemo, createSignal, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Modal from "@components/ui/Modal";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type {
	CrawlerStatusDto,
	NetworkAdapterConfig,
	NetworkRuntimeConfig,
	NetworkRuntimeConfigDocument,
} from "@cvsa/contracts";
import NetworkAdapterForm from "../network/NetworkAdapterForm";
import NetworkAdapterList from "../network/NetworkAdapterList";
import NetworkRoutingPolicy from "../network/NetworkRoutingPolicy";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";
import Save from "lucide-solid/icons/save";

type NetworkSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
	refreshStatus: () => Promise<void>;
};

function RevisionBadge(props: { revision: number }) {
	const t = getComponentT("crawler");
	return (
		<Badge variant="neutral" size="sm">
			{t("network.adapters.revision").replace("{revision}", String(props.revision))}
		</Badge>
	);
}

export default function NetworkSection(props: NetworkSectionProps) {
	const t = getComponentT("crawler");

	const [networkDoc, setNetworkDoc] = createSignal<NetworkRuntimeConfigDocument | null>(null);
	const [savedSnapshot, setSavedSnapshot] = createSignal<string>("");
	const [loading, setLoading] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const [formOpen, setFormOpen] = createSignal(false);
	const [editing, setEditing] = createSignal<NetworkAdapterConfig>();
	const [configMissing, setConfigMissing] = createSignal(false);
	const requests = createConfigRequestCoordinator();

	const isDirty = createMemo(() => {
		const doc = networkDoc();
		if (!doc || !savedSnapshot()) return false;
		return JSON.stringify(doc.config) !== savedSnapshot();
	});

	const loadConfig = async () => {
		if (loading() || saving() || isDirty()) return;
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
					requestsPerSecond: 5,
					rateLimits: [{ durationSeconds: 1, maxRequests: 5 }],
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

		const request = requests.beginSave();
		setSaving(true);
		const res = await api.crawler.updateNetworkConfig({
			revision: current.revision,
			config: current.config,
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
			config: {
				...current.config,
				adapters: [...current.config.adapters, adapter],
			},
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
		if (
			current.config.bindings?.some(
				(binding) => binding.adapterIds.length === 1 && binding.adapterIds[0] === id
			)
		) {
			toast.error(t("network.routing.lastAdapter"));
			return;
		}
		setNetworkDoc({
			...current,
			config: {
				...current.config,
				adapters: current.config.adapters.filter((adapter) => adapter.id !== id),
				bindings: current.config.bindings?.map((binding) => ({
					...binding,
					adapterIds: binding.adapterIds.filter((adapterId) => adapterId !== id),
				})),
			},
		});
		toast.info(t("common.delete"));
	};

	const saveAdapter = (adapter: NetworkAdapterConfig): boolean => {
		const original = editing();
		if (!original) return addAdapter(adapter);
		const current = networkDoc();
		if (!current) return false;
		setNetworkDoc({
			...current,
			config: {
				...current.config,
				adapters: current.config.adapters.map((item) =>
					item.id === original.id ? adapter : item
				),
			},
		});
		return true;
	};

	useCrawlerRefresh("network", () => void loadConfig());

	return (
		<div class="flex flex-col gap-6">
			<SectionHeader
				title={
					<>
						<h2 class="ts-heading-2">{t("tabs.network")}</h2>
						<Show when={networkDoc()}>
							{(doc) => <RevisionBadge revision={doc().revision} />}
						</Show>
					</>
				}
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
							disabled={loading() || !networkDoc() || !isDirty()}
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
				when={networkDoc()}
				fallback={
					<div class="p-10 text-center text-tertiary border border-border flex flex-col items-center gap-4 bg-surface">
						<span>
							{loading()
								? t("common.loading")
								: configMissing()
									? t("network.adapters.empty")
									: t("network.adapters.loadFailed")}
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
								{t("common.retry")}
							</Button>
						</Show>
					</div>
				}
			>
				{(doc) => (
					<fieldset disabled={saving()} class="min-w-0 border-0 p-0">
						<div class="flex flex-col gap-6">
							<NetworkAdapterList
								adapters={doc().config.adapters}
								status={props.statusData()}
								configRevision={doc().revision}
								dirty={isDirty()}
								onToggle={toggleAdapter}
								onRemove={removeAdapter}
								onEdit={(adapter) => {
									setEditing(adapter);
									setFormOpen(true);
								}}
								onAdd={() => {
									setEditing(undefined);
									setFormOpen(true);
								}}
							/>

							<NetworkRoutingPolicy
								config={doc().config}
								onChange={(config) => setNetworkDoc({ ...doc(), config })}
							/>

							<NetworkSessionPolicy
								config={doc().config.session}
								status={props.statusData()?.session}
								onChange={(session) =>
									setNetworkDoc({
										...doc(),
										config: { ...doc().config, session },
									})
								}
							/>
						</div>
					</fieldset>
				)}
			</Show>
			<Modal
				isOpen={formOpen()}
				closeLabel={t("common.close")}
				onClose={() => setFormOpen(false)}
				title={editing() ? t("network.form.editTitle") : t("network.form.title")}
			>
				<Show when={formOpen()}>
					<NetworkAdapterForm
						adapter={editing()}
						onSave={saveAdapter}
						onCancel={() => setFormOpen(false)}
					/>
				</Show>
			</Modal>
		</div>
	);
}
