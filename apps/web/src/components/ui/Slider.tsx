import clsx from "clsx";
import "./Slider.css";
import { Show, createSignal, splitProps } from "solid-js";

export interface SliderProps {
	value?: number;
	defaultValue?: number;
	min?: number;
	max?: number;
	step?: number;
	onChange?: (value: number) => void;
	label?: string;
	formatValue?: (value: number) => string;
	disabled?: boolean;
	class?: string;
	id?: string;
}

export default function Slider(props: SliderProps) {
	const [local, rest] = splitProps(props, [
		"value",
		"defaultValue",
		"min",
		"max",
		"step",
		"onChange",
		"label",
		"formatValue",
		"disabled",
		"class",
		"id",
	]);

	const [internalVal, setInternalVal] = createSignal(
		local.value ?? local.defaultValue ?? local.min ?? 0
	);

	const currentVal = () => local.value ?? internalVal();
	const minVal = () => local.min ?? 0;
	const maxVal = () => local.max ?? 100;
	const stepVal = () => local.step ?? 1;

	const handleInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
		const val = Number.parseFloat(e.currentTarget.value);
		if (!Number.isNaN(val)) {
			setInternalVal(val);
			local.onChange?.(val);
		}
	};

	const displayVal = () => {
		if (local.formatValue) return local.formatValue(currentVal());
		return String(currentVal());
	};

	return (
		<div class={clsx("flex flex-col gap-1.5", local.class)}>
			<Show when={local.label || local.formatValue}>
				<div class="flex items-center justify-between text-sm">
					<Show when={local.label}>
						<span class="font-medium text-primary select-none">{local.label}</span>
					</Show>
					<span class="text-sm text-primary font-medium select-none">{displayVal()}</span>
				</div>
			</Show>

			<div class="relative flex items-center h-6">
				<input
					type="range"
					id={local.id}
					min={minVal()}
					max={maxVal()}
					step={stepVal()}
					value={currentVal()}
					disabled={local.disabled}
					onInput={handleInput}
					class={clsx(
						"w-full h-2 bg-surface-container-medium border border-border appearance-none cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors cvsa-slider",
						"focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary",
						local.disabled && "opacity-50 cursor-not-allowed"
					)}
					{...rest}
				/>
			</div>
		</div>
	);
}
