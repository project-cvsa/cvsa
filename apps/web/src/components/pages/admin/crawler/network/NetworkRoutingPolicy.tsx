import { createSignal, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import NumberField from "@components/ui/NumberField";
import Switch from "@components/ui/Switch";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { NetworkRuntimeConfig } from "@cvsa/contracts";

type NetworkRoutingPolicyProps = {
	config: NetworkRuntimeConfig;
	onChange: (config: NetworkRuntimeConfig) => void;
};

export default function NetworkRoutingPolicy(props: NetworkRoutingPolicyProps) {
	const t = getComponentT("crawler");
	const [requestType, setRequestType] = createSignal("");
	const bindings = () => props.config.bindings ?? [];
	const policies = () => props.config.requestTypePolicies ?? {};
	const reservedTotal = () =>
		Object.values(policies()).reduce((sum, policy) => sum + policy.reservedShare, 0);
	const unboundPolicies = () =>
		Object.keys(policies()).filter(
			(name) => !bindings().some((binding) => binding.requestType === name)
		);

	const removePolicy = (name: string) =>
		props.onChange({
			...props.config,
			requestTypePolicies: Object.fromEntries(
				Object.entries(policies()).filter(([key]) => key !== name)
			),
		});

	const addBinding = () => {
		const name = requestType().trim();
		const adapter =
			props.config.adapters.find((item) => item.enabled) ?? props.config.adapters[0];
		if (
			!name ||
			name.length > 128 ||
			!adapter ||
			bindings().some((binding) => binding.requestType === name)
		) {
			toast.error(t("network.routing.invalidType"));
			return;
		}
		props.onChange({
			...props.config,
			bindings: [...bindings(), { requestType: name, adapterIds: [adapter.id] }],
		});
		setRequestType("");
	};

	const removeBinding = (name: string) => {
		props.onChange({
			...props.config,
			bindings: bindings().filter((binding) => binding.requestType !== name),
			requestTypePolicies: Object.fromEntries(
				Object.entries(policies()).filter(([key]) => key !== name)
			),
		});
	};

	const toggleAdapter = (name: string, id: string, checked: boolean) => {
		props.onChange({
			...props.config,
			bindings: bindings().map((binding) =>
				binding.requestType === name
					? {
							...binding,
							adapterIds: checked
								? [...binding.adapterIds, id]
								: binding.adapterIds.filter((item) => item !== id),
						}
					: binding
			),
		});
	};

	const setReserve = (name: string, percentage: number) => {
		const fraction = percentage / 100;
		const others = reservedTotal() - (policies()[name]?.reservedShare ?? 0);
		if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 || others + fraction > 1) {
			toast.error(t("network.routing.reserveInvalid"));
			return;
		}
		props.onChange({
			...props.config,
			requestTypePolicies: { ...policies(), [name]: { reservedShare: fraction } },
		});
	};

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h3 class="ts-heading-3 text-primary">{t("network.routing.title")}</h3>
				<p class="ts-caption text-secondary mt-1">{t("network.routing.description")}</p>
			</div>
			<Show
				when={bindings().length}
				fallback={<p class="ts-caption text-secondary">{t("network.routing.empty")}</p>}
			>
				<div class="flex flex-col divide-y divide-border border-y border-border">
					<For each={bindings()}>
						{(binding) => (
							<div class="flex flex-col gap-3 py-4">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<strong class="text-primary">{binding.requestType}</strong>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => removeBinding(binding.requestType)}
									>
										{t("common.delete")}
									</Button>
								</div>
								<div class="flex flex-wrap gap-x-6 gap-y-3">
									<For each={props.config.adapters}>
										{(adapter) => (
											<Switch
												size="sm"
												label={adapter.id}
												checked={binding.adapterIds.includes(adapter.id)}
												disabled={
													binding.adapterIds.length === 1 &&
													binding.adapterIds.includes(adapter.id)
												}
												onChange={(checked) =>
													toggleAdapter(
														binding.requestType,
														adapter.id,
														checked
													)
												}
											/>
										)}
									</For>
								</div>
								<div class="max-w-xs">
									<NumberField
										size="sm"
										label={t("network.routing.reserve")}
										value={Math.round(
											(policies()[binding.requestType]?.reservedShare ?? 0) *
												100
										)}
										min={0}
										max={100}
										step={1}
										suffix="%"
										onChange={(value) => setReserve(binding.requestType, value)}
									/>
								</div>
							</div>
						)}
					</For>
				</div>
			</Show>
			<Show when={unboundPolicies().length > 0}>
				<p class="ts-caption text-secondary">{t("network.routing.unbound")}</p>
				<For each={unboundPolicies()}>
					{(name) => (
						<div class="flex flex-wrap items-end gap-3">
							<div class="max-w-xs">
								<NumberField
									size="sm"
									label={`${name} · ${t("network.routing.reserve")}`}
									value={Math.round((policies()[name]?.reservedShare ?? 0) * 100)}
									min={0}
									max={100}
									step={1}
									suffix="%"
									onChange={(value) => setReserve(name, value)}
								/>
							</div>
							<Button size="sm" variant="ghost" onClick={() => removePolicy(name)}>
								{t("common.delete")}
							</Button>
						</div>
					)}
				</For>
			</Show>
			<p class="ts-caption text-secondary">
				{t("network.routing.reservedTotal").replace(
					"{percent}",
					String(Math.round(reservedTotal() * 100))
				)}
			</p>
			<div class="flex flex-col items-start gap-2 max-w-md">
				<TextField
					class="w-full"
					label={t("network.routing.requestType")}
					value={requestType()}
					onInput={(event) => setRequestType(event.currentTarget.value)}
				/>
				<Button
					size="sm"
					variant="outlined"
					disabled={!requestType().trim() || props.config.adapters.length === 0}
					onClick={addBinding}
				>
					{t("network.routing.add")}
				</Button>
			</div>
		</section>
	);
}
