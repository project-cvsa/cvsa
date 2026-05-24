import { type ComponentProps, splitProps } from "solid-js";

type ButtonVariant = "filled" | "outlined" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentProps<"button"> {
	variant?: ButtonVariant;
	size?: ButtonSize;
}

const variantClass: Record<ButtonVariant, string> = {
	filled: "bg-primary text-display-inverted border border-primary hover:bg-secondary hover:border-secondary",
	outlined: "bg-transparent text-primary border border-border hover:bg-surface-container-medium",
	ghost: "bg-transparent text-primary border border-transparent hover:bg-surface-container-medium",
};

const sizeClass: Record<ButtonSize, string> = {
	sm: "px-3 h-8 ts-caption",
	md: "px-6 h-11 ts-label",
	lg: "px-10 h-16 ts-body",
};

export default function Button(props: ButtonProps) {
	const [local, rest] = splitProps(props, ["variant", "size", "class", "children"]);

	const variant = () => local.variant ?? "filled";
	const size = () => local.size ?? "md";

	return (
		<button
			class={`inline-flex items-center justify-center 
                font-medium transition-colors focus-visible:outline-2
				focus-visible:outline-offset-6 focus-visible:outline-primary
                 ${variantClass[variant()]} ${sizeClass[size()]} ${local.class ?? ""}`}
			{...rest}
		>
			{local.children}
		</button>
	);
}
