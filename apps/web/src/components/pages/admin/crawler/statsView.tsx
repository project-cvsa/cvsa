import { For, Show, type JSX } from "solid-js";
import type { CrawlerQueueSnapshot } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import { formatWaitSeconds } from "./format";

/** One headline metric with brutalist sharp border styling. */
export function MetricCard(props: {
	label: string;
	value: string | JSX.Element;
	hint?: string | JSX.Element;
	variant?: "default" | "success" | "warning" | "danger";
	icon?: () => JSX.Element;
}) {
	const variantClass = () => {
		switch (props.variant) {
			case "success":
				return "border-primary bg-surface";
			case "warning":
				return "border-highlight bg-surface";
			case "danger":
				return "border-error bg-surface";
			default:
				return "border-border bg-surface";
		}
	};

	return (
		<div
			class={
				"p-4 border flex flex-col justify-between gap-1.5 shadow-sm transition-colors " +
				variantClass()
			}
		>
			<div class="flex items-center justify-between gap-2">
				<span class="ts-caption text-xs uppercase tracking-wide text-tertiary select-none">
					{props.label}
				</span>
				<Show when={props.icon}>
					{(Icon) => <div class="text-tertiary shrink-0">{Icon()()}</div>}
				</Show>
			</div>
			<div class="ts-heading-3 font-semibold text-primary tracking-tight mt-0.5">
				{props.value}
			</div>
			<Show when={props.hint}>
				<div class="ts-caption text-tertiary text-xs mt-0.5">{props.hint}</div>
			</Show>
		</div>
	);
}

/** Per-queue backlog counters with sharp brutalist design. */
export function QueueStatusTable(props: {
	queues: Record<string, CrawlerQueueSnapshot>;
	emptyLabel?: string;
}) {
	const rows = () => Object.entries(props.queues).map(([name, snapshot]) => ({ name, snapshot }));

	return (
		<Show
			when={rows().length > 0}
			fallback={
				<div class="p-8 text-center text-tertiary border border-border bg-surface text-sm">
					{props.emptyLabel ?? "暂无活动队列"}
				</div>
			}
		>
			<div class="overflow-x-auto border border-border bg-surface">
				<table class="w-full text-left ts-caption">
					<thead>
						<tr class="border-b border-border text-tertiary bg-surface-container-high uppercase tracking-wider text-xs">
							<th class="py-2.5 px-4 font-semibold">队列</th>
							<th class="py-2.5 px-4 font-semibold">进行中</th>
							<th class="py-2.5 px-4 font-semibold">等待中</th>
							<th class="py-2.5 px-4 font-semibold">延迟</th>
							<th class="py-2.5 px-4 font-semibold">失败</th>
							<th class="py-2.5 px-4 font-semibold">最长等待</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border text-sm">
						<For each={rows()}>
							{(row) => (
								<tr class="hover:bg-hover transition-colors">
									<td class="py-2.5 px-4 font-medium text-primary flex items-center gap-2">
										<div class="w-2 h-2 bg-primary" />
										<span>{row.name}</span>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.active > 0}
											fallback={<span class="text-tertiary">0</span>}
										>
											<Badge variant="info" size="sm">
												{row.snapshot.active}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.waiting > 0}
											fallback={<span class="text-tertiary">0</span>}
										>
											<Badge variant="neutral" size="sm">
												{row.snapshot.waiting}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.delayed > 0}
											fallback={<span class="text-tertiary">0</span>}
										>
											<Badge variant="warning" size="sm">
												{row.snapshot.delayed}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4">
										<Show
											when={row.snapshot.failed > 0}
											fallback={<span class="text-tertiary">0</span>}
										>
											<Badge variant="danger" size="sm">
												{row.snapshot.failed}
											</Badge>
										</Show>
									</td>
									<td class="py-2.5 px-4 text-secondary">
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
