import clsx from "clsx";
import type { JSX } from "solid-js";
import { createMemo, Show, splitProps } from "solid-js";

export interface CardProps {
	class?: string;
	children?: JSX.Element;
}

export function Card(props: CardProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={clsx(
				"bg-surface border border-border shadow-xl overflow-hidden transition-colors",
				local.class
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export interface CardHeaderProps {
	title?: string | JSX.Element;
	actions?: JSX.Element;
	variant?: "inverted" | "bordered";
	class?: string;
	children?: JSX.Element;
}

export function CardHeader(props: CardHeaderProps) {
	const [local, rest] = splitProps(props, [
		"title",
		"actions",
		"variant",
		"class",
		"children",
	]);

	const isInverted = () => local.variant === "inverted";
	const title = createMemo(() => local.title);
	const actions = createMemo(() => local.actions);

	return (
		<div
			class={clsx(
				isInverted()
					? "h-11 sm:h-12 bg-primary text-display-inverted px-4 flex items-center justify-between font-[Outfit,system-ui] uppercase text-sm tracking-wide"
					: "px-4 py-3 border-b border-border bg-surface flex items-center justify-between font-[Outfit,system-ui] uppercase text-sm tracking-wide",
				local.class
			)}
			{...rest}
		>
			<Show when={title()} fallback={local.children}>
				<div class="flex items-center gap-3 min-w-0">
					<Show when={title()}>
						<div
							class={clsx(
								"font-semibold truncate",
								isInverted() ? "text-display-inverted" : "text-primary"
							)}
						>
							{title()}
						</div>
					</Show>
				</div>
				<Show when={actions()}>
					<div class="flex items-center gap-2 shrink-0">{actions()}</div>
				</Show>
			</Show>
		</div>
	);
}

export interface CardContentProps {
	class?: string;
	children?: JSX.Element;
}

export function CardContent(props: CardContentProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div class={clsx("p-4 sm:p-5", local.class)} {...rest}>
			{local.children}
		</div>
	);
}

export interface CardFooterProps {
	class?: string;
	children?: JSX.Element;
}

export function CardFooter(props: CardFooterProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={clsx(
				"px-4 py-3 border-t border-border bg-surface-container-high flex items-center justify-between gap-3 text-sm",
				local.class
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export default Card;
