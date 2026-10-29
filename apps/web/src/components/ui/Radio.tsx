import { cn } from "@lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { For, Show, createUniqueId, splitProps, type JSX } from "solid-js";

const radioGroupVariants = cva("flex", {
	variants: {
		direction: {
			col: "flex-col gap-3",
			row: "flex-row flex-wrap items-center gap-6",
		},
	},
	defaultVariants: {
		direction: "col",
	},
});

type RadioDirection = NonNullable<VariantProps<typeof radioGroupVariants>["direction"]>;

export interface RadioOption<T extends string = string> {
	value: T;
	label: string | JSX.Element;
	description?: string;
	disabled?: boolean;
}

export interface RadioGroupProps<T extends string = string> {
	value: T;
	onChange: (value: T) => void;
	options: ReadonlyArray<RadioOption<T>> | RadioOption<T>[];
	name?: string;
	label?: string;
	direction?: RadioDirection;
	disabled?: boolean;
	class?: string;
}

export function RadioGroup<T extends string = string>(props: RadioGroupProps<T>) {
	const [local, rest] = splitProps(props, [
		"value",
		"onChange",
		"options",
		"name",
		"label",
		"direction",
		"disabled",
		"class",
	]);

	const uid = createUniqueId();
	const groupName = () => local.name ?? `rg-${uid}`;
	const direction = () => local.direction ?? "col";

	return (
		<div class={cn("flex flex-col gap-2", local.class)} role="radiogroup" {...rest}>
			<Show when={local.label}>
				<span class="text-label tracking-label font-medium text-primary select-none">
					{local.label}
				</span>
			</Show>

			<div class={radioGroupVariants({ direction: direction() })}>
				<For each={local.options}>
					{(option) => {
						const isSelected = () => local.value === option.value;
						const isDisabled = () => local.disabled || option.disabled;

						return (
							<label
								class={cn(
									"inline-flex items-start gap-2.5 select-none transition-colors",
									isDisabled()
										? "opacity-50 cursor-not-allowed"
										: "cursor-pointer"
								)}
							>
								<div class="pt-0.5 shrink-0">
									<input
										type="radio"
										name={groupName()}
										value={option.value}
										checked={isSelected()}
										disabled={isDisabled()}
										onChange={() => local.onChange(option.value)}
										class="sr-only"
									/>
									<div
										class={cn(
											"w-4 h-4 border flex items-center justify-center transition-colors bg-surface",
											isSelected()
												? "border-primary"
												: "border-border hover:border-tertiary"
										)}
									>
										<Show when={isSelected()}>
											<div class="w-2 h-2 bg-primary" />
										</Show>
									</div>
								</div>

								<div class="flex flex-col">
									<span class="text-label tracking-label font-medium text-primary">
										{option.label}
									</span>
									<Show when={option.description}>
										<span class="text-caption tracking-caption text-tertiary mt-0.5">
											{option.description}
										</span>
									</Show>
								</div>
							</label>
						);
					}}
				</For>
			</div>
		</div>
	);
}

export default RadioGroup;
