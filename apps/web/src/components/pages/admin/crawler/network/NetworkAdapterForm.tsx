import { createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import Select, { type SelectOption } from "@components/ui/Select";
import NumberField from "@components/ui/NumberField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { NetworkAdapterConfig } from "@cvsa/contracts";
import Plus from "lucide-solid/icons/plus";

type NetworkAdapterFormProps = {
	onAdd: (adapter: NetworkAdapterConfig) => boolean;
};

export default function NetworkAdapterForm(props: NetworkAdapterFormProps) {
	const t = getComponentT("crawler");

	const [id, setId] = createSignal("");
	const [type, setType] = createSignal<"direct" | "http-proxy">("http-proxy");
	const [proxyUrl, setProxyUrl] = createSignal("");
	const [weight, setWeight] = createSignal(1);
	const [duration, setDuration] = createSignal(60);
	const [maxRequests, setMaxRequests] = createSignal(120);

	const typeOptions: SelectOption[] = [
		{ value: "http-proxy", label: t("network.adapters.type.proxy") },
		{ value: "direct", label: t("network.adapters.type.direct") },
	];

	const add = () => {
		const adapterId = id().trim();
		if (!adapterId) {
			toast.error(t("network.form.idHelper"));
			return;
		}
		if (!/^[a-zA-Z0-9_-]+$/.test(adapterId)) {
			toast.error(t("network.form.idHelper"));
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
				toast.error(t("network.form.urlHelper"));
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
		setWeight(1);
		toast.success(t("common.success"));
	};

	return (
		<Card>
			<CardHeader
				title={
					<div class="flex items-center gap-2">
						<Plus class="w-4 h-4 text-primary" />
						<span>{t("network.form.title")}</span>
					</div>
				}
			/>
			<CardContent class="flex flex-col gap-4">
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					<TextField
						label={t("network.form.id")}
						value={id()}
						onInput={(e) => setId(e.currentTarget.value)}
						helperText={t("network.form.idHelper")}
					/>

					<Select
						label={t("network.form.type")}
						options={typeOptions}
						value={type()}
						onValueChange={(val) => {
							if (val === "direct" || val === "http-proxy") {
								setType(val);
							}
						}}
					/>

					<NumberField
						label={t("network.form.weight")}
						min={0.1}
						step={0.1}
						value={weight()}
						onChange={(val) => setWeight(val)}
						helperText={t("network.form.weightHelper")}
					/>
				</div>

				<Show when={type() === "http-proxy"}>
					<TextField
						label={t("network.form.url")}
						value={proxyUrl()}
						onInput={(e) => setProxyUrl(e.currentTarget.value)}
						helperText={t("network.form.urlHelper")}
					/>
				</Show>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<NumberField
						label={t("network.form.rateLimitDuration")}
						min={0}
						value={duration()}
						onChange={(val) => setDuration(val)}
						suffix="s"
					/>

					<NumberField
						label={t("network.form.rateLimitMax")}
						min={0}
						value={maxRequests()}
						onChange={(val) => setMaxRequests(val)}
					/>
				</div>

				<div class="flex justify-end pt-2">
					<Button variant="filled" size="md" onClick={add} class="gap-1.5">
						<Plus class="w-4 h-4" />
						<span>{t("network.form.submit")}</span>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
