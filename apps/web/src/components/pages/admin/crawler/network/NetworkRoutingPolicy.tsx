import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { For } from "solid-js";
import Button from "@components/ui/Button";
import TagInput from "@components/ui/TagInput";
import Switch from "@components/ui/Switch";
import { toast } from "@components/ui/Toast";
import { getComponentT } from "@lib/i18n/isomorphic";
import { BILIBILI_REQUEST_TYPES, type NetworkRuntimeConfig } from "@cvsa/contracts";
import Trash2 from "lucide-solid/icons/trash-2";

type NetworkRoutingPolicyProps = {
	config: NetworkRuntimeConfig;
	onChange: (config: NetworkRuntimeConfig) => void;
};

export default function NetworkRoutingPolicy(props: NetworkRoutingPolicyProps) {
	const t = getComponentT("crawler");
	const bindings = () => props.config.bindings ?? [];

	const changeRequestTypes = (names: string[]) => {
		const adapter =
			props.config.adapters.find((item) => item.enabled) ?? props.config.adapters[0];
		if (BILIBILI_REQUEST_TYPES.some((name) => !names.includes(name))) {
			toast.error(t("network.routing.requiredTypes"));
			return;
		}
		if (!adapter || names.some((name) => name.length > 128)) {
			toast.error(t("network.routing.invalidType"));
			return;
		}
		props.onChange({
			...props.config,
			bindings: names.map(
				(name) =>
					bindings().find((binding) => binding.requestType === name) ?? {
						requestType: name,
						adapterIds: [adapter.id],
					}
			),
		});
	};

	const removeBinding = (name: string) => {
		props.onChange({
			...props.config,
			bindings: bindings().filter((binding) => binding.requestType !== name),
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

	type Binding = NonNullable<NetworkRuntimeConfig["bindings"]>[number];
	const columns: TableColumn<Binding>[] = [
		{
			id: "type",
			header: t("network.routing.requestType"),
			class: "w-52 font-semibold text-primary",
			cell: (binding) => binding.requestType,
		},
		{
			id: "adapters",
			header: t("audit.binding"),
			cell: (binding) => (
				<div class="flex flex-wrap items-center gap-4">
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
									toggleAdapter(binding.requestType, adapter.id, checked)
								}
							/>
						)}
					</For>
				</div>
			),
		},
		{
			id: "actions",
			header: t("audit.actions"),
			class: "text-right w-30",
			cell: (binding) => (
				<Button
					size="sm"
					variant="outlined"
					class="text-error"
					disabled={BILIBILI_REQUEST_TYPES.includes(binding.requestType)}
					onClick={() => removeBinding(binding.requestType)}
				>
					<Trash2 class="w-3.5 h-3.5" />
					{t("common.delete")}
				</Button>
			),
		},
	];

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="ts-heading-3 text-primary">{t("network.routing.title")}</h3>
				</div>
			</div>

			<TagInput
				tags={bindings().map((binding) => binding.requestType)}
				onChange={changeRequestTypes}
				placeholder={t("network.routing.requestType")}
				disabled={props.config.adapters.length === 0}
				clearLabel={t("common.clear")}
				removeLabel={t("common.delete")}
			/>
			<DataTable columns={columns} items={bindings()} empty={t("network.routing.empty")} />
		</section>
	);
}
