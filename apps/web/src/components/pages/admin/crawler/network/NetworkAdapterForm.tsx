import { createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import type { NetworkAdapterConfig } from "@cvsa/contracts";

type NetworkAdapterFormProps = {
	onAdd: (adapter: NetworkAdapterConfig) => boolean;
};

export default function NetworkAdapterForm(props: NetworkAdapterFormProps) {
	const [id, setId] = createSignal("");
	const [type, setType] = createSignal<"direct" | "http-proxy">("http-proxy");
	const [proxyUrl, setProxyUrl] = createSignal("");
	const [weight, setWeight] = createSignal(1);
	const [duration, setDuration] = createSignal(60);
	const [maxRequests, setMaxRequests] = createSignal(120);

	const add = () => {
		const adapterId = id().trim();
		if (!adapterId) {
			toast.error("Adapter ID required");
			return;
		}
		if (!/^[a-zA-Z0-9_-]+$/.test(adapterId)) {
			toast.error("Use letters, numbers, _ or -");
			return;
		}

		const rateLimits =
			duration() > 0 && maxRequests() > 0
				? [{ durationSeconds: duration(), maxRequests: maxRequests() }]
				: [];
		let adapter: NetworkAdapterConfig;
		if (type() === "http-proxy") {
			const endpoint = proxyUrl().trim();
			if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
				toast.error("Proxy URL must start with http:// or https://");
				return;
			}
			adapter = {
				type: "http-proxy",
				id: adapterId,
				enabled: true,
				baseWeight: weight() > 0 ? weight() : 1,
				rateLimits,
				proxyUrl: endpoint,
			};
		} else {
			adapter = {
				type: "direct",
				id: adapterId,
				enabled: true,
				baseWeight: weight() > 0 ? weight() : 1,
				rateLimits,
			};
		}
		if (!props.onAdd(adapter)) return;
		setId("");
		setProxyUrl("");
	};

	return (
		<div class="p-4 rounded border border-border flex flex-col gap-3">
			<h3 class="ts-subhead font-semibold text-primary">Add adapter</h3>
			<div class="grid grid-cols-1 md:grid-cols-5 gap-3">
				<div class="flex flex-col gap-1">
					<label class="ts-label text-primary" for="crawler-adapter-id">
						ID
					</label>
					<input
						id="crawler-adapter-id"
						type="text"
						class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={id()}
						onInput={(event) => setId(event.currentTarget.value)}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="ts-label text-primary" for="crawler-adapter-type">
						Type
					</label>
					<select
						id="crawler-adapter-type"
						class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={type()}
						onChange={(event) =>
							setType(
								event.currentTarget.value === "direct" ? "direct" : "http-proxy"
							)
						}
					>
						<option value="http-proxy">HTTP proxy</option>
						<option value="direct">Direct</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label class="ts-label text-primary" for="crawler-adapter-weight">
						Weight
					</label>
					<input
						id="crawler-adapter-weight"
						type="number"
						min="0.1"
						step="0.1"
						class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={weight()}
						onInput={(event) =>
							setWeight(Number.parseFloat(event.currentTarget.value) || 1)
						}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="ts-label text-primary" for="crawler-rate-window">
						Rate window (s)
					</label>
					<input
						id="crawler-rate-window"
						type="number"
						min="0"
						class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={duration()}
						onInput={(event) =>
							setDuration(Number.parseInt(event.currentTarget.value, 10) || 0)
						}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="ts-label text-primary" for="crawler-rate-requests">
						Max requests
					</label>
					<input
						id="crawler-rate-requests"
						type="number"
						min="0"
						class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={maxRequests()}
						onInput={(event) =>
							setMaxRequests(Number.parseInt(event.currentTarget.value, 10) || 0)
						}
					/>
				</div>
			</div>
			<Show when={type() === "http-proxy"}>
				<div class="flex flex-col gap-1">
					<label class="ts-label text-primary" for="crawler-proxy-url">
						Proxy URL
					</label>
					<input
						id="crawler-proxy-url"
						type="text"
						class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm"
						value={proxyUrl()}
						onInput={(event) => setProxyUrl(event.currentTarget.value)}
					/>
				</div>
			</Show>
			<div>
				<Button size="sm" variant="outlined" onClick={add}>
					Add to draft
				</Button>
			</div>
		</div>
	);
}
