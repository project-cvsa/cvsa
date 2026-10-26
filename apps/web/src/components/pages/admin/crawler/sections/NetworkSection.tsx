import { createSignal, onMount, Show } from "solid-js";
import type { Accessor } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type {
	CrawlerStatusDto,
	NetworkAdapterConfig,
	NetworkRuntimeConfigDocument,
} from "@cvsa/contracts";
import NetworkAdapterForm from "../network/NetworkAdapterForm";
import NetworkAdapterList from "../network/NetworkAdapterList";
import NetworkHealthPolicy from "../network/NetworkHealthPolicy";
import NetworkStatus from "../network/NetworkStatus";
import { applySaveResult, createConfigRequestCoordinator } from "../saveDraft";

type NetworkSectionProps = {
	statusData: Accessor<CrawlerStatusDto | null>;
	loadingStatus: Accessor<boolean>;
	refreshStatus: () => Promise<void>;
};

export default function NetworkSection(props: NetworkSectionProps) {
	const [networkDoc, setNetworkDoc] = createSignal<NetworkRuntimeConfigDocument | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const [configMissing, setConfigMissing] = createSignal(false);
	const requests = createConfigRequestCoordinator();

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
			toast.error(res.error.message || "Could not load network config");
			return;
		}
		if (!res.data) {
			toast.error("No network config");
			return;
		}
		setConfigMissing(false);
		setNetworkDoc(res.data);
	};

	const initializeConfig = async () => {
		if (loading() || saving()) return;
		const request = requests.beginSave();
		setSaving(true);
		const res = await api.crawler.updateNetworkConfig({
			revision: 0,
			config: {
				adapters: [
					{
						type: "direct",
						id: "direct-default",
						enabled: true,
						baseWeight: 1,
						rateLimits: [],
					},
				],
				requestTypePolicies: {},
			},
		});
		if (!requests.canApplySave(request)) return;
		setSaving(false);
		if (res.ok && res.data) {
			setConfigMissing(false);
			setNetworkDoc(res.data);
			toast.success("Network config initialized");
			void props.refreshStatus();
			return;
		}
		toast.error(
			res.ok ? "Initialization failed" : res.error.message || "Initialization failed"
		);
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
			toast.success("Network config saved");
			void props.refreshStatus();
			return;
		}
		toast.error(res.ok ? "Save failed" : res.error.message || "Could not save network config");
	};

	const addAdapter = (adapter: NetworkAdapterConfig): boolean => {
		const current = networkDoc();
		if (!current) return false;
		if (current.config.adapters.some((item) => item.id === adapter.id)) {
			toast.error("Adapter ID already exists");
			return false;
		}
		setNetworkDoc({
			...current,
			config: { ...current.config, adapters: [...current.config.adapters, adapter] },
		});
		toast.info("Adapter added to draft");
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
		toast.info("Adapter removed from draft");
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

	onMount(() => {
		void loadConfig();
	});

	return (
		<div class="flex flex-col gap-6">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="ts-heading-2 text-primary">Network</h2>
					<div class="ts-caption text-tertiary">
						Revision {networkDoc()?.revision ?? "—"}
					</div>
				</div>
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
						disabled={loading() || saving() || !networkDoc()}
						onClick={() => void saveConfig()}
					>
						{saving() ? "Saving" : "Save"}
					</Button>
				</div>
			</div>

			<NetworkStatus
				status={props.statusData}
				loading={props.loadingStatus}
				refresh={props.refreshStatus}
			/>

			<Show
				when={networkDoc()}
				fallback={
					<div class="p-6 text-center text-tertiary border border-border rounded flex flex-col items-center gap-3">
						<span>
							{loading()
								? "Loading"
								: configMissing()
									? "No network config"
									: "No config returned"}
						</span>
						<Show when={configMissing() && !loading()}>
							<Button
								size="sm"
								variant="filled"
								disabled={loading() || saving()}
								onClick={() => void initializeConfig()}
							>
								{saving() ? "Initializing" : "Initialize"}
							</Button>
						</Show>
					</div>
				}
			>
				{(doc) => (
					<fieldset disabled={loading() || saving()} class="min-w-0 border-0 p-0">
						<div class="flex flex-col gap-6">
							<NetworkAdapterForm onAdd={addAdapter} />
							<NetworkAdapterList
								adapters={doc().config.adapters}
								status={props.statusData()}
								onToggle={toggleAdapter}
								onRemove={removeAdapter}
								onWeightChange={updateWeight}
							/>
							<NetworkHealthPolicy config={doc().config.health} />
						</div>
					</fieldset>
				)}
			</Show>
		</div>
	);
}
