import clsx from "clsx";
import { type ComponentProps, Show, splitProps } from "solid-js";

type ButtonVariant = "filled" | "outlined" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentProps<"button"> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
	filled: "bg-primary text-display-inverted border border-primary hover:bg-secondary hover:border-secondary active:opacity-90",
	outlined:
		"bg-transparent text-primary border border-border hover:bg-hover active:bg-surface-container-high",
	ghost: "bg-transparent text-primary border border-transparent hover:bg-hover active:bg-surface-container-high",
};

const sizeClass: Record<ButtonSize, string> = {
	sm: "px-3 h-8 text-xs",
	md: "px-4 h-10 text-sm",
	lg: "px-6 h-14 text-base",
};

export default function Button(props: ButtonProps) {
	const [local, rest] = splitProps(props, [
		"variant",
		"size",
		"loading",
		"disabled",
		"class",
		"children",
	]);

	const variant = () => local.variant ?? "filled";
	const size = () => local.size ?? "md";

	return (
		<button
			disabled={local.disabled || local.loading}
			class={clsx(
				"relative inline-flex items-center justify-center font-medium transition-colors select-none",
				"focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary",
				"disabled:cursor-not-allowed disabled:opacity-60",
				variantClass[variant()],
				sizeClass[size()],
				local.class
			)}
			{...rest}
		>
			<Show when={local.loading}>
				<span class="absolute inset-0 flex items-center justify-center">
					<svg
						class="animate-spin h-3.5 w-3.5 text-current"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="3"
						/>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
						/>
					</svg>
				</span>
			</Show>
			<span
				class={clsx(
					"inline-flex items-center justify-center gap-1.5",
					local.loading && "invisible"
				)}
			>
				{local.children}
			</span>
		</button>
	);
}
