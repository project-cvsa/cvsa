import { cn } from "@lib/cn";
import { Show, type JSX } from "solid-js";
import "./Table.css";

export type TableProps = {
	class?: string;
	head: JSX.Element;
	children?: JSX.Element;
	busy?: boolean;
	caption?: string;
};

export default function Table(props: TableProps) {
	return (
		<div
			class="cvsa-scroll overflow-x-auto border border-border bg-surface"
			aria-busy={props.busy}
		>
			<table class={cn("cvsa-table", props.class)}>
				<Show when={props.caption}>
					<caption class="sr-only">{props.caption}</caption>
				</Show>
				<thead>{props.head}</thead>
				<tbody>{props.children}</tbody>
			</table>
		</div>
	);
}
