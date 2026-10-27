import clsx from "clsx";
import { Show, createUniqueId, splitProps } from "solid-js";

export type SwitchSize = "sm" | "md";

export interface SwitchProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	label?: string;
	description?: string;
	size?: SwitchSize;
	id?: string;
	class?: string;
	name?: string;
	"aria-label"?: string;
}

const sizeStyles: Record<SwitchSize, { track: string; thumb: string; thumbChecked: string }> = {
	sm: {
		track: "w-8 h-4.5 p-0.5",
		thumb: "w-3.5 h-3.5",
		thumbChecked: "translate-x-3.5",
	},
	md: {
		track: "w-11 h-6 p-0.5",
		thumb: "w-5 h-5",
		thumbChecked: "translate-x-5",
	},
};

export default function Switch(props: SwitchProps) {
	const [local, rest] = splitProps(props, [
		"checked",
		"onChange",
		"disabled",
		"label",
		"description",
		"size",
		"id",
		"class",
		"name",
		"aria-label",
	]);

	const uid = createUniqueId();
	const switchId = () => local.id ?? uid;
	const size = () => local.size ?? "md";

	const toggle = () => {
		if (local.disabled) return;
		local.onChange(!local.checked);
	};

	return (
		<label
			for={switchId()}
			class={clsx(
				"inline-flex items-center gap-3 select-none",
				local.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
				local.class
			)}
		>
			<button
				type="button"
				role="switch"
				id={switchId()}
				name={local.name}
				aria-checked={local.checked}
				aria-label={local["aria-label"] ?? local.label}
				disabled={local.disabled}
				onClick={toggle}
				class={clsx(
					"relative inline-flex shrink-0 rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
					sizeStyles[size()].track,
					local.checked ? "bg-primary" : "bg-surface-container-high border border-border"
				)}
				{...rest}
			>
				<span
					class={clsx(
						"pointer-events-none inline-block transform rounded-full bg-surface shadow transition duration-200 ease-in-out",
						sizeStyles[size()].thumb,
						local.checked ? sizeStyles[size()].thumbChecked : "translate-x-0"
					)}
				/>
			</button>

			<Show when={local.label || local.description}>
				<div class="flex flex-col">
					<Show when={local.label}>
						<span class="ts-label text-primary font-medium">{local.label}</span>
					</Show>
					<Show when={local.description}>
						<span class="ts-caption text-tertiary">{local.description}</span>
					</Show>
				</div>
			</Show>
		</label>
	);
}
