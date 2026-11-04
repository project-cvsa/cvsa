import { For, type JSX } from "solid-js";
import Table from "./Table";

export type TableColumn<T> = {
	id: string;
	header: JSX.Element;
	cell: (item: T) => JSX.Element;
	class?: string;
};

type DataTableProps<T> = {
	tableClass?: string;
	columns: readonly TableColumn<T>[];
	items: readonly T[];
	busy?: boolean;
	empty?: JSX.Element;
	onRowClick?: (item: T) => void;
};

export default function DataTable<T>(props: DataTableProps<T>) {
	const head = () => (
		<tr>
			<For each={props.columns}>
				{(column) => <th class={column.class}>{column.header}</th>}
			</For>
		</tr>
	);
	const empty = () => (
		<tr>
			<td colSpan={props.columns.length}>{props.empty}</td>
		</tr>
	);
	return (
		<Table class={props.tableClass} head={head()} busy={props.busy}>
			<For each={props.items} fallback={empty()}>
				{(item) => (
					<tr
						class="border-b border-border last:border-b-0"
						onClick={props.onRowClick ? () => props.onRowClick?.(item) : undefined}
						classList={{
							"cursor-pointer": Boolean(props.onRowClick),
							"hover:bg-hover": Boolean(props.onRowClick),
						}}
					>
						<For each={props.columns}>
							{(column) => <td class={column.class}>{column.cell(item)}</td>}
						</For>
					</tr>
				)}
			</For>
		</Table>
	);
}
