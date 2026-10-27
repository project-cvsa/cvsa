import clsx from "clsx";
import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";

export interface CardProps {
	class?: string;
	children?: JSX.Element;
}

export function Card(props: CardProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={clsx(
				"bg-surface border border-border rounded-lg shadow-sm overflow-hidden transition-colors",
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
	description?: string | JSX.Element;
	actions?: JSX.Element;
	class?: string;
	children?: JSX.Element;
}

export function CardHeader(props: CardHeaderProps) {
	const [local, rest] = splitProps(props, [
		"title",
		"description",
		"actions",
		"class",
		"children",
	]);
	return (
		<div
			class={clsx(
				"px-5 py-4 border-b border-border flex items-center justify-between gap-4",
				local.class
			)}
			{...rest}
		>
			<Show when={local.title || local.description} fallback={local.children}>
				<div class="flex flex-col gap-0.5 min-w-0">
					<Show when={local.title}>
						<h3 class="ts-subhead font-semibold text-primary truncate">
							{local.title}
						</h3>
					</Show>
					<Show when={local.description}>
						<p class="ts-caption text-tertiary">{local.description}</p>
					</Show>
				</div>
				<Show when={local.actions}>
					<div class="flex items-center gap-2 shrink-0">{local.actions}</div>
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
		<div class={clsx("p-5", local.class)} {...rest}>
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
				"px-5 py-3 border-t border-border bg-surface-container-high/20 flex items-center justify-between gap-3 text-sm",
				local.class
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export default Card;
