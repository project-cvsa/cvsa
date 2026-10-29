import { cn } from "@lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

const badgeVariants = cva(
	"inline-flex items-center justify-center font-medium border select-none whitespace-nowrap shrink-0 transition-colors",
	{
		variants: {
			variant: {
				default: "bg-surface-container-medium text-primary border-border",
				neutral: "bg-surface-container-high text-secondary border-border",
				success: "bg-primary text-display-inverted border-primary",
				warning: "bg-highlight text-on-highlight border-highlight",
				danger: "bg-error text-on-error border-error",
				info: "bg-surface text-primary border-primary",
				highlight: "bg-highlight text-on-highlight border-highlight",
			},
			size: {
				sm: "h-5 px-1.5 gap-1 text-caption tracking-caption",
				md: "h-6 px-2 gap-1.5 text-caption tracking-caption",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	}
);

const badgeDotVariants = cva("shrink-0", {
	variants: {
		variant: {
			default: "bg-primary",
			neutral: "bg-secondary",
			success: "bg-display-inverted",
			warning: "bg-on-highlight",
			danger: "bg-on-error",
			info: "bg-primary",
			highlight: "bg-on-highlight",
		},
		size: {
			sm: "w-1.5 h-1.5",
			md: "w-2 h-2",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "md",
	},
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>;

export interface BadgeProps {
	variant?: BadgeVariant;
	size?: BadgeSize;
	dot?: boolean;
	class?: string;
	children?: JSX.Element;
}

export default function Badge(props: BadgeProps) {
	const [local, rest] = splitProps(props, ["variant", "size", "dot", "class", "children"]);

	const variant = () => local.variant ?? "default";
	const size = () => local.size ?? "md";

	return (
		<span
			class={cn(badgeVariants({ variant: variant(), size: size() }), local.class)}
			{...rest}
		>
			<Show when={local.dot}>
				<span
					class={cn(badgeDotVariants({ variant: variant(), size: size() }))}
					aria-hidden="true"
				/>
			</Show>
			{local.children}
		</span>
	);
}
