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
		container: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
		dot: "bg-emerald-500",
	},
	warning: {
		container: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
		dot: "bg-amber-500",
	},
	danger: {
		container: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
		dot: "bg-red-500",
	},
	info: {
		container: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
		dot: "bg-sky-500",
	},
	highlight: {
		container: "bg-highlight/30 text-display border-highlight",
		dot: "bg-display",
	},
};

const sizeStyles: Record<BadgeSize, { badge: string; dot: string }> = {
	sm: {
		badge: "h-5 px-1.5 text-[11px] gap-1",
		dot: "w-1.5 h-1.5",
	},
	md: {
		badge: "h-6 px-2.5 text-xs gap-1.5",
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
				"inline-flex items-center justify-center font-medium rounded-full border select-none transition-colors",
				variantStyles[variant()].container,
				sizeStyles[size()].badge,
				local.class
			)}
			{...rest}
		>
			<Show when={local.dot}>
				<span
					class={clsx(
						"rounded-full shrink-0",
						sizeStyles[size()].dot,
						variantStyles[variant()].dot
					)}
					aria-hidden="true"
				/>
			</Show>
			{local.children}
		</span>
	);
}
