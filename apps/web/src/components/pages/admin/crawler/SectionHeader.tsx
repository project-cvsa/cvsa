import clsx from "clsx";
import type { JSX } from "solid-js";

type SectionHeaderProps = {
	title: JSX.Element;
	actions?: JSX.Element;
	nowrap?: boolean;
};

export default function SectionHeader(props: SectionHeaderProps) {
	return (
		<header class={props.nowrap ? "cvsa-scroll overflow-x-auto" : undefined}>
			<div
				class={clsx(
					"flex min-h-8 items-center justify-between gap-3",
					props.nowrap ? "min-w-max flex-nowrap" : "flex-wrap"
				)}
			>
				<div class="flex min-w-0 items-center gap-3 text-sm font-semibold text-primary">
					{props.title}
				</div>
				<div class="flex shrink-0 items-center gap-2">{props.actions}</div>
			</div>
		</header>
	);
}
