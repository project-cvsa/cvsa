import { For, Show } from "solid-js";
import NumberField from "@components/ui/NumberField";
import TextField from "@components/ui/TextField";
import Select from "@components/ui/Select";
import TagInput from "@components/ui/TagInput";
import {
	BilibiliSessionConfigSchema,
	BrowserIdentityConfigSchema,
	type BilibiliSessionConfig,
	type BilibiliSessionStatus,
} from "@cvsa/contracts";
import { getComponentT } from "@lib/i18n/isomorphic";

type Props = {
	config?: BilibiliSessionConfig;
	status?: BilibiliSessionStatus;
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
			<h3 class="ts-heading-3 text-primary">{t("network.session.title")}</h3>
			<p class="ts-caption text-secondary">{t("network.session.description")}</p>
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
				<Select
					size="md"
					label={t("network.session.family")}
					value={config().browser.family}
					options={[
						{ value: "auto", label: t("network.session.auto") },
						{ value: "chrome", label: "Chrome" },
						{ value: "edge", label: "Edge" },
						{ value: "safari", label: "Safari" },
					]}
					onValueChange={(value) => {
						const parsed = BrowserIdentityConfigSchema.shape.family.safeParse(value);
						if (parsed.success)
							update({ browser: { ...config().browser, family: parsed.data } });
					}}
				/>
				<For
					each={
						[
							"chromeVersion",
							"edgeVersion",
							"safariVersion",
							"language",
						] satisfies Array<
							keyof Pick<
								BilibiliSessionConfig["browser"],
								"chromeVersion" | "edgeVersion" | "safariVersion" | "language"
							>
						>
					}
				>
					{(key) => (
						<TextField
							size="sm"
							label={t(`network.session.${key}`)}
							value={config().browser[key]}
							onInput={(event) =>
								update({
									browser: {
										...config().browser,
										[key]: event.currentTarget.value,
									},
								})
							}
						/>
					)}
				</For>
			</div>
			<div class="flex flex-col gap-2">
				<p class="ts-label text-primary">{t("network.session.recoveryCodes")}</p>
				<TagInput
					tags={config().recoveryCodes.map(String)}
					onChange={(values) => {
						const parsed = BilibiliSessionConfigSchema.shape.recoveryCodes.safeParse(
							values.map(Number)
						);
						if (parsed.success) update({ recoveryCodes: parsed.data });
					}}
					clearLabel={t("common.clear")}
					removeLabel={t("common.delete")}
				/>
				<p class="ts-caption text-secondary">{t("network.session.recoveryHelp")}</p>
			</div>
			<Show when={props.status}>
				{(status) => (
					<dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 ts-caption text-secondary border border-border p-3">
						<div>
							<dt>{t("network.session.identity")}</dt>
							<dd class="text-primary">
								{status().browser} · {status().generation}
							</dd>
						</div>
						<div>
							<dt>{t("network.session.state")}</dt>
							<dd>
								{status().refreshing
									? t("network.session.refreshing")
									: status().ready
										? t("network.session.ready")
										: t("network.session.pending")}
							</dd>
						</div>
						<div>
							<dt>{t("network.session.lastRefresh")}</dt>
							<dd>
								{status().lastRefreshAt
									? new Date(status().lastRefreshAt ?? 0).toLocaleString()
									: "—"}
							</dd>
						</div>
						<div>
							<dt>{t("network.session.nextRefresh")}</dt>
							<dd>
								{status().nextRefreshAt
									? new Date(status().nextRefreshAt ?? 0).toLocaleString()
									: "—"}
							</dd>
						</div>
						<Show when={status().lastRefreshError}>
							<div class="text-error sm:col-span-2">{status().lastRefreshError}</div>
						</Show>
					</dl>
				)}
			</Show>
		</section>
	);
}
