import { createSignal, Index, Show } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import Select, { type SelectOption } from "@components/ui/Select";
import NumberField from "@components/ui/NumberField";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import {
	NetworkAdapterConfigSchema,
	type NetworkAdapterConfig,
	type NetworkRateLimit,
} from "@cvsa/contracts";

type NetworkAdapterFormProps = {
	adapter?: NetworkAdapterConfig;
	onSave: (adapter: NetworkAdapterConfig) => boolean;
	onCancel: () => void;
};

function isValidProxyUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

export default function NetworkAdapterForm(props: NetworkAdapterFormProps) {
	const t = getComponentT("crawler");

	const [id, setId] = createSignal(props.adapter?.id ?? "");
	const [type, setType] = createSignal<"direct" | "http-proxy">(
		props.adapter?.type ?? "http-proxy"
	);
	const [proxyUrl, setProxyUrl] = createSignal(
		props.adapter?.type === "http-proxy" ? props.adapter.proxyUrl : ""
	);
	const [weight, setWeight] = createSignal(props.adapter?.baseWeight ?? 1);
	const [limits, setLimits] = createSignal<NetworkRateLimit[]>(
		props.adapter?.rateLimits.map((limit) => ({ ...limit })) ?? [
			{ durationSeconds: 60, maxRequests: 120 },
		]
	);
	const updateLimit = (index: number, update: Partial<NetworkRateLimit>) => {
		setLimits((current) =>
			current.map((limit, position) => (position === index ? { ...limit, ...update } : limit))
		);
	};

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

		let adapter: NetworkAdapterConfig;
		if (type() === "http-proxy") {
			const endpoint = proxyUrl().trim();
			if (!isValidProxyUrl(endpoint)) {
				toast.error(t("network.form.urlHelper"));
				return;
			}
			adapter = {
				type: "http-proxy",
				id: adapterId,
				enabled: props.adapter?.enabled ?? true,
				baseWeight: weight() > 0 ? weight() : 1,
				rateLimits: limits(),
				proxyUrl: endpoint,
			};
		} else {
			adapter = {
				type: "direct",
				id: adapterId,
				enabled: props.adapter?.enabled ?? true,
				baseWeight: weight() > 0 ? weight() : 1,
				rateLimits: limits(),
			};
		}

		if (!NetworkAdapterConfigSchema.safeParse(adapter).success) {
			toast.error(t("network.form.invalid"));
			return;
		}
		if (!props.onSave(adapter)) return;
		props.onCancel();
		setId("");
		setProxyUrl("");
		setWeight(1);
		toast.success(t("common.success"));
	};

	return (
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-4">
				<TextField
					label={t("network.form.id")}
					disabled={Boolean(props.adapter)}
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

			<section class="flex flex-col gap-3">
				<div class="flex items-center justify-between gap-3">
					<h3 class="ts-label text-primary">{t("network.adapters.col.rateLimit")}</h3>
					<Button
						variant="outlined"
						size="sm"
						onClick={() =>
							setLimits((current) => [
								...current,
								{ durationSeconds: 60, maxRequests: 120 },
							])
						}
					>
						{t("network.form.addLimit")}
					</Button>
				</div>
				<Show when={limits().length === 0}>
					<p class="ts-caption text-secondary">{t("common.unlimited")}</p>
				</Show>
				<Index each={limits()}>
					{(limit, index) => (
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<NumberField
								label={t("network.form.rateLimitDuration")}
								min={1}
								max={3600}
								value={limit().durationSeconds}
								onChange={(value) => updateLimit(index, { durationSeconds: value })}
								suffix="s"
							/>
							<NumberField
								label={t("network.form.rateLimitMax")}
								min={1}
								max={1000000}
								value={limit().maxRequests}
								onChange={(value) => updateLimit(index, { maxRequests: value })}
							/>
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									setLimits((current) =>
										current.filter((_, position) => position !== index)
									)
								}
							>
								{t("common.delete")}
							</Button>
						</div>
					)}
				</Index>
			</section>

			<div class="flex justify-end pt-2">
				<Button variant="ghost" size="md" onClick={props.onCancel}>
					{t("common.cancel")}
				</Button>
				<Button variant="filled" size="md" onClick={add}>
					{props.adapter ? t("common.save") : t("network.form.submit")}
				</Button>
			</div>
		</div>
	);
}
