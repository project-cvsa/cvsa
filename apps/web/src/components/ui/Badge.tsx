import clsx from "clsx";
import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

export type BadgeVariant =
	| "default"
	| "neutral"
	| "success"
	| "warning"
	| "danger"
	| "info"
	| "highlight";

export type BadgeSize = "sm" | "md";

export interface BadgeProps {
	variant?: BadgeVariant;
	size?: BadgeSize;
	dot?: boolean;
	class?: string;
	children?: JSX.Element;
}

const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
	default: {
		container: "bg-surface-container-medium text-primary border-border",
		dot: "bg-primary",
	},
	neutral: {
		container: "bg-surface-container-high text-secondary border-border",
		dot: "bg-secondary",
	},
	success: {
		container: "bg-primary text-display-inverted border-primary",
		dot: "bg-display-inverted",
	},
	warning: {
		container: "bg-highlight text-[var(--on-highlight)] border-highlight",
		dot: "bg-[var(--on-highlight)]",
	},
	danger: {
		container: "bg-error text-on-error border-error",
		dot: "bg-on-error",
	},
	info: {
		container: "bg-surface text-primary border-primary",
		dot: "bg-primary",
	},
	highlight: {
		container: "bg-highlight text-[var(--on-highlight)] border-highlight",
		dot: "bg-[var(--on-highlight)]",
	},
};

const sizeStyles: Record<BadgeSize, { badge: string; dot: string }> = {
	sm: {
		badge: "h-5 px-1.5 text-xs gap-1",
		dot: "w-1.5 h-1.5",
	},
	md: {
		badge: "h-6 px-2 text-xs gap-1.5",
		dot: "w-2 h-2",
	},
};

export default function Badge(props: BadgeProps) {
	const [local, rest] = splitProps(props, ["variant", "size", "dot", "class", "children"]);

	const variant = () => local.variant ?? "default";
	const size = () => local.size ?? "md";

	return (
		<span
			class={clsx(
				"inline-flex items-center justify-center font-medium border select-none whitespace-nowrap shrink-0 transition-colors",
				variantStyles[variant()].container,
				sizeStyles[size()].badge,
				local.class
			)}
			{...rest}
		>
			<Show when={local.dot}>
				<span
					class={clsx("shrink-0", sizeStyles[size()].dot, variantStyles[variant()].dot)}
					aria-hidden="true"
				/>
			</Show>
			{local.children}
		</span>
	);
}
