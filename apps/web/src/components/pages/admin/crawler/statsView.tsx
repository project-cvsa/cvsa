import { For, Show } from "solid-js";
import type { CrawlerQueueSnapshot } from "@cvsa/contracts";
import { formatWaitSeconds } from "./format";

/** One headline metric. */
export function MetricCard(props: { label: string; value: string; hint?: string }) {
	return (
		<div class="p-4 rounded border border-border flex flex-col gap-1">
			<span class="ts-caption text-tertiary">{props.label}</span>
			<span class="ts-heading-3 font-semibold text-primary">{props.value}</span>
			<Show when={props.hint}>
				{(hint) => <span class="ts-caption text-tertiary">{hint()}</span>}
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
				<div class="p-6 text-center text-tertiary border border-border rounded">
					{props.emptyLabel ?? "No queues"}
				</div>
			}
		>
			<div class="overflow-x-auto border border-border rounded">
				<table class="w-full text-left ts-caption">
					<thead>
						<tr class="border-b border-border text-tertiary">
							<th class="py-2 px-3">Queue</th>
							<th class="py-2 px-3">Waiting</th>
							<th class="py-2 px-3">Active</th>
							<th class="py-2 px-3">Delayed</th>
							<th class="py-2 px-3">Failed</th>
							<th class="py-2 px-3">Oldest wait</th>
						</tr>
					</thead>
					<tbody>
						<For each={rows()}>
							{(row) => (
								<tr class="border-b border-border hover:bg-hover">
									<td class="py-2 px-3 font-mono font-medium text-primary">
										{row.name}
									</td>
									<td class="py-2 px-3">{row.snapshot.waiting}</td>
									<td class="py-2 px-3">{row.snapshot.active}</td>
									<td class="py-2 px-3">{row.snapshot.delayed}</td>
									<td class="py-2 px-3">{row.snapshot.failed}</td>
									<td class="py-2 px-3 text-tertiary">
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
