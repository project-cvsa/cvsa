import { For, Show, type JSX } from "solid-js";
import type { CrawlerQueueSnapshot } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import { formatWaitSeconds } from "./format";

/** One headline metric. */
export function MetricCard(props: {
	label: string;
	value: string | JSX.Element;
	hint?: string | JSX.Element;
	variant?: "default" | "success" | "warning" | "danger";
	icon?: () => JSX.Element;
}) {
	const borderColor = () => {
		switch (props.variant) {
			case "success":
				return "border-emerald-500/20";
			case "warning":
				return "border-amber-500/20";
			case "danger":
				return "border-red-500/20";
			default:
				return "border-border";
		}
	};

	return (
		<div
			class={
				"p-4 rounded-lg border bg-surface flex flex-col justify-between gap-1 shadow-xs transition-colors " +
				borderColor()
			}
		>
			<div class="flex items-center justify-between gap-2">
				<span class="ts-caption text-tertiary select-none">{props.label}</span>
				<Show when={props.icon}>
					{(Icon) => <div class="text-tertiary shrink-0">{Icon()()}</div>}
				</Show>
			</div>
			<div class="ts-heading-3 font-semibold text-primary font-mono tracking-tight mt-0.5">
				{props.value}
			</div>
			<Show when={props.hint}>
				<div class="ts-caption text-tertiary text-xs mt-0.5">{props.hint}</div>
			</Show>
		</div>
	);
}

/** Per-queue backlog counters, shared by the overview and tasks panels. */
export function QueueStatusTable(props: {
	queues: Record<string, CrawlerQueueSnapshot>;
	emptyLabel?: string;
}) {
	const rows = () => Object.entries(props.queues).map(([name, snapshot]) => ({ name, snapshot }));

	return (
		<Show
			when={rows().length > 0}
			fallback={
				<div class="p-8 text-center text-tertiary border border-border rounded-lg bg-surface">
					{props.emptyLabel ?? "No queues"}
				</div>
			}
		>
			<div class="overflow-x-auto border border-border rounded-lg bg-surface">
				<table class="w-full text-left ts-caption">
					<thead>
						<tr class="border-b border-border text-tertiary bg-surface-container-high/30">
							<th class="py-2.5 px-4 font-medium">Queue Name</th>
							<th class="py-2.5 px-4 font-medium">Active</th>
							<th class="py-2.5 px-4 font-medium">Waiting</th>
							<th class="py-2.5 px-4 font-medium">Delayed</th>
							<th class="py-2.5 px-4 font-medium">Failed</th>
							<th class="py-2.5 px-4 font-medium">Oldest Wait</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						<For each={rows()}>
							{(row) => (
								<tr class="hover:bg-hover transition-colors">
									<td class="py-2.5 px-4 font-mono font-medium text-primary flex items-center gap-2">
										<span class="w-2 h-2 rounded-full bg-primary/40" />
										<span>{row.name}</span>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.active > 0}
											fallback={
												<span class="text-tertiary font-mono">0</span>
											}
										>
											<Badge variant="info" size="sm">
												{row.snapshot.active}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.waiting > 0}
											fallback={
												<span class="text-tertiary font-mono">0</span>
											}
										>
											<Badge variant="warning" size="sm">
												{row.snapshot.waiting}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4">
										<span class="font-mono text-secondary">
											{row.snapshot.delayed}
										</span>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.failed > 0}
											fallback={
												<span class="text-tertiary font-mono">0</span>
											}
										>
											<Badge variant="danger" size="sm">
												{row.snapshot.failed}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4 font-mono text-tertiary">
										{formatWaitSeconds(row.snapshot.oldestWaitSec)}
									</td>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
		</Show>
	);
}
