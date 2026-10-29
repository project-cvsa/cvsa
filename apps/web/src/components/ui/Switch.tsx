import { cn } from "@lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Show, createUniqueId, splitProps } from "solid-js";

const switchTrackVariants = cva(
	"relative inline-flex shrink-0 border transition-colors duration-150 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary",
	{
		variants: {
			size: {
				sm: "w-8 h-4.5 p-0.5",
				md: "w-11 h-6 p-0.5",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

const switchThumbVariants = cva(
	"pointer-events-none inline-block transform transition-transform duration-150",
	{
		variants: {
			size: {
				sm: "w-3 h-3",
				md: "w-4.5 h-4.5",
			},
			checked: {
				true: "bg-display-inverted",
				false: "bg-primary translate-x-0",
			},
		},
		compoundVariants: [
			{ checked: true, size: "sm", class: "translate-x-3.5" },
			{ checked: true, size: "md", class: "translate-x-5" },
		],
		defaultVariants: {
			size: "md",
			checked: false,
		},
	}
);

export type SwitchSize = NonNullable<VariantProps<typeof switchTrackVariants>["size"]>;

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
			class={cn(
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
				class={cn(
					switchTrackVariants({ size: size() }),
					local.checked
						? "bg-primary border-primary"
						: "bg-surface-container-high border-border"
				)}
				{...rest}
			>
				<span class={switchThumbVariants({ size: size(), checked: local.checked })} />
			</button>

			<Show when={local.label || local.description}>
				<div class="flex flex-col">
					<Show when={local.label}>
						<span class="text-label tracking-label font-medium text-primary">
							{local.label}
						</span>
					</Show>
					<Show when={local.description}>
						<span class="ts-caption text-tertiary">{local.description}</span>
					</Show>
				</div>
			</Show>
		</label>
	);
}
