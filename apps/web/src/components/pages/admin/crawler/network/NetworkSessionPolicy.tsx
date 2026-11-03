import { For } from "solid-js";
import NumberField from "@components/ui/NumberField";
import { BilibiliSessionConfigSchema, type BilibiliSessionConfig } from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";

type Props = {
	disabled?: boolean;
	config?: BilibiliSessionConfig;
	onChange: (config: BilibiliSessionConfig) => void;
};
export default function NetworkSessionPolicy(props: Props) {
	const t = getComponentT("crawler");
	const config = () => props.config ?? BilibiliSessionConfigSchema.parse({});
	const update = (value: Partial<BilibiliSessionConfig>) =>
		props.onChange({ ...config(), ...value });
	const fields: Array<{
		key: "refreshIntervalMs" | "refreshRetryMs" | "recoveryAttempts";
		min: number;
		max: number;
		scale: number;
	}> = [
		{ key: "refreshIntervalMs", min: 1, max: 360, scale: 60000 },
		{ key: "refreshRetryMs", min: 1, max: 300, scale: 1000 },
		{ key: "recoveryAttempts", min: 0, max: 2, scale: 1 },
	];
	return (
		<section class="flex flex-col gap-4">
			<div class="flex items-center justify-between gap-3">
				<h3 class="ts-heading-3 text-primary">{t("network.session.title")}</h3>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<For each={fields}>
					{(field) => (
						<NumberField
							size="sm"
							label={t(`network.session.${field.key}`)}
							value={config()[field.key] / field.scale}
							min={field.min}
							max={field.max}
							step={1}
							onChange={(value) =>
								update({
									[field.key]:
										Math.max(
											field.min,
											Math.min(field.max, Math.round(value))
										) * field.scale,
								})
							}
						/>
					)}
				</For>
			</div>
		</section>
	);
}
