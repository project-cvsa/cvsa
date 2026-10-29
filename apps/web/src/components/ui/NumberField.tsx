import { cn } from "@lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Show, createUniqueId, splitProps } from "solid-js";
import { controlSizeClass } from "./controlStyles";

const numberFieldLabelVariants = cva("font-medium text-primary select-none", {
	variants: {
		size: {
			sm: "ts-caption",
			md: "ts-label",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const numberFieldInputVariants = cva(
	"w-full border bg-surface text-primary transition-colors focus-visible:outline-none focus:border-primary",
	{
		variants: {
			size: {
				sm: "px-2.5",
				md: "px-3",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

export type NumberFieldSize = NonNullable<VariantProps<typeof numberFieldInputVariants>["size"]>;

export interface NumberFieldProps {
	value?: number;
	defaultValue?: number;
	onChange?: (value: number) => void;
	onInput?: (event: InputEvent & { currentTarget: HTMLInputElement }) => void;
	min?: number;
	max?: number;
	step?: number;
	label?: string;
	helperText?: string;
	errorText?: string;
	suffix?: string;
	disabled?: boolean;
	size?: NumberFieldSize;
	id?: string;
	class?: string;
	placeholder?: string;
}

export default function NumberField(props: NumberFieldProps) {
	const [local, rest] = splitProps(props, [
		"value",
		"defaultValue",
		"onChange",
		"onInput",
		"min",
		"max",
		"step",
		"label",
		"helperText",
		"errorText",
		"suffix",
		"disabled",
		"size",
		"id",
		"class",
		"placeholder",
	]);

	const uid = createUniqueId();
	const inputId = () => local.id ?? uid;
	const size = () => local.size ?? "md";

	const handleInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		local.onInput?.(event);
		const raw = event.currentTarget.value;
		if (raw === "") return;
		const parsed = Number.parseFloat(raw);
		if (!Number.isNaN(parsed)) {
			local.onChange?.(parsed);
		}
	};

	return (
		<div class={cn("flex flex-col gap-1.5", local.class)}>
			<Show when={local.label}>
				<label
					for={inputId()}
					class={cn(
						numberFieldLabelVariants({ size: size() }),
						local.disabled && "opacity-60"
					)}
				>
					{local.label}
				</label>
			</Show>

			<div class="relative flex items-center">
				<input
					id={inputId()}
					type="number"
					value={local.value}
					min={local.min}
					max={local.max}
					step={local.step ?? 1}
					disabled={local.disabled}
					placeholder={local.placeholder}
					onInput={handleInput}
					style={{
						"-webkit-appearance": "none",
						"-moz-appearance": "textfield",
						margin: "0",
					}}
					class={cn(
						numberFieldInputVariants({ size: size() }),
						controlSizeClass(size()),
						local.errorText
							? "border-error focus-visible:outline-error"
							: "border-border hover:border-tertiary",
						local.disabled && "cursor-not-allowed opacity-50 bg-surface-container-high",
						local.suffix && "pr-12"
					)}
					{...rest}
				/>
				<Show when={local.suffix}>
					<span class="pointer-events-none absolute right-3 ts-caption text-tertiary select-none">
						{local.suffix}
					</span>
				</Show>
			</div>

			<Show when={local.errorText || local.helperText}>
				<p
					class={cn(
						"ts-caption mt-0.5",
						local.errorText ? "text-error font-medium" : "text-tertiary"
					)}
				>
					{local.errorText || local.helperText}
				</p>
			</Show>
		</div>
	);
}
