import { createSignal, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import NumberField from "@components/ui/NumberField";
import Switch from "@components/ui/Switch";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { NetworkRuntimeConfig } from "@cvsa/contracts";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";

type NetworkRoutingPolicyProps = {
	config: NetworkRuntimeConfig;
	onChange: (config: NetworkRuntimeConfig) => void;
};

export default function NetworkRoutingPolicy(props: NetworkRoutingPolicyProps) {
	const t = getComponentT("crawler");
	const [requestType, setRequestType] = createSignal("");
	const [isAdding, setIsAdding] = createSignal(false);
	const bindings = () => props.config.bindings ?? [];
	const policies = () => props.config.requestTypePolicies ?? {};
	const reservedTotal = () =>
		Object.values(policies()).reduce((sum, policy) => sum + policy.reservedShare, 0);

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
		setIsAdding(false);
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
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="ts-heading-3 text-primary">{t("network.routing.title")}</h3>
					<p class="ts-caption text-secondary mt-1">{t("network.routing.description")}</p>
				</div>
				<div class="flex items-center gap-4">
					<div class="text-xs text-secondary font-mono">
						{t("network.routing.reservedTotal").replace(
							"{percent}",
							String(Math.round(reservedTotal() * 100))
						)}
					</div>
					<Button
						size="sm"
						variant="outlined"
						onClick={() => setIsAdding(true)}
						disabled={isAdding() || props.config.adapters.length === 0}
						class="gap-1.5"
					>
						<Plus class="w-3.5 h-3.5" />
						<span>{t("network.routing.add")}</span>
					</Button>
				</div>
			</div>

			<div class="border border-border bg-surface">
				<Show
					when={bindings().length || isAdding()}
					fallback={
						<div class="p-8 text-center text-tertiary text-sm">
							{t("network.routing.empty")}
						</div>
					}
				>
					<div class="cvsa-scroll overflow-x-auto">
						<table class="w-full text-left ts-caption">
							<thead>
								<tr class="border-b border-border text-tertiary bg-surface-container-high uppercase tracking-wider text-xs">
									<th class="py-2.5 px-4 font-semibold w-52">
										{t("network.routing.requestType")}
									</th>
									<th class="py-2.5 px-4 font-semibold">出口适配器绑定</th>
									<th class="py-2.5 px-4 font-semibold w-40">预留容量</th>
									<th class="py-2.5 px-4 font-semibold text-right w-24">操作</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border text-sm">
								<For each={bindings()}>
									{(binding) => (
										<tr class="hover:bg-hover transition-colors">
											<td class="py-3 px-4 font-semibold text-primary">
												{binding.requestType}
											</td>
											<td class="py-3 px-4">
												<div class="flex flex-wrap items-center gap-4">
													<For each={props.config.adapters}>
														{(adapter) => (
															<Switch
																size="sm"
																label={adapter.id}
																checked={binding.adapterIds.includes(
																	adapter.id
																)}
																disabled={
																	binding.adapterIds.length ===
																		1 &&
																	binding.adapterIds.includes(
																		adapter.id
																	)
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
											</td>
											<td class="py-3 px-4">
												<div class="w-28">
													<NumberField
														size="sm"
														value={Math.round(
															(policies()[binding.requestType]
																?.reservedShare ?? 0) * 100
														)}
														min={0}
														max={100}
														step={1}
														suffix="%"
														onChange={(value) =>
															setReserve(binding.requestType, value)
														}
													/>
												</div>
											</td>
											<td class="py-3 px-4 text-right">
												<Button
													size="sm"
													variant="outlined"
													class="text-error border-error/30 hover:border-error hover:bg-error/10"
													onClick={() =>
														removeBinding(binding.requestType)
													}
												>
													<Trash2 class="w-3.5 h-3.5" />
													<span>{t("common.delete")}</span>
												</Button>
											</td>
										</tr>
									)}
								</For>
								<Show when={isAdding()}>
									<tr class="bg-surface-container-low border-t border-border">
										<td class="py-3 px-4">
											<div class="w-48">
												<TextField
													size="sm"
													placeholder={t("network.routing.requestType")}
													value={requestType()}
													onInput={(event) =>
														setRequestType(event.currentTarget.value)
													}
													onKeyDown={(e) => {
														if (e.key === "Enter") addBinding();
														if (e.key === "Escape") {
															setIsAdding(false);
															setRequestType("");
														}
													}}
												/>
											</div>
										</td>
										<td class="py-3 px-4 text-xs text-tertiary">
											添加后自动绑定首个可用出口
										</td>
										<td class="py-3 px-4 text-xs text-tertiary">默认 0%</td>
										<td class="py-3 px-4 text-right">
											<div class="flex items-center justify-end gap-1.5">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => {
														setIsAdding(false);
														setRequestType("");
													}}
												>
													{t("common.cancel")}
												</Button>
												<Button
													size="sm"
													variant="filled"
													disabled={!requestType().trim()}
													onClick={addBinding}
												>
													{t("common.add")}
												</Button>
											</div>
										</td>
									</tr>
								</Show>
							</tbody>
						</table>
					</div>
				</Show>
			</div>
		</section>
	);
}
