import { For, Show, type JSX } from "solid-js";
import clsx from "clsx";
import type { CrawlerOverviewStats, CrawlerQueueSnapshot } from "@cvsa/contracts";
import Badge from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatPercent, formatWaitSeconds } from "./format";

/** One headline metric. */
export function MetricCard(props: {
	label: string;
	value: string | JSX.Element;
	hint?: string | JSX.Element;
	variant?: "default" | "success" | "warning" | "danger";
	icon?: () => JSX.Element;
}) {
	return (
		<div
			class={clsx(
				"p-4 bg-surface flex flex-col justify-between gap-1.5",
				props.variant === "warning" && "border-l-2 border-highlight",
				props.variant === "danger" && "border-l-2 border-error"
			)}
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

/** Per-queue backlog counters. */
export function QueueStatusTable(props: {
	queues: Record<string, CrawlerQueueSnapshot>;
	emptyLabel?: string;
}) {
	const t = getComponentT("crawler");
	const rows = () => Object.entries(props.queues).map(([name, snapshot]) => ({ name, snapshot }));

	return (
		<Show
			when={rows().length > 0}
			fallback={
				<div class="p-8 text-center text-tertiary border border-border bg-surface text-sm">
					{props.emptyLabel ?? t("queue.empty")}
				</div>
			}
		>
			<div class="cvsa-scroll overflow-x-auto border border-border bg-surface">
				<table class="w-full text-left ts-caption">
					<thead>
						<tr class="border-b border-border text-tertiary bg-surface-container-high uppercase tracking-wider text-xs">
							<th class="py-2.5 px-4 font-semibold">{t("queue.name")}</th>
							<th class="py-2.5 px-4 font-semibold">{t("queue.active")}</th>
							<th class="py-2.5 px-4 font-semibold">{t("queue.waiting")}</th>
							<th class="py-2.5 px-4 font-semibold">{t("queue.delayed")}</th>
							<th class="py-2.5 px-4 font-semibold">{t("queue.failed")}</th>
							<th class="py-2.5 px-4 font-semibold">{t("queue.oldest")}</th>
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

/** Isomorphic failure status table matching QueueStatusTable styling */
export function FailureStatusTable(props: {
	breakdown: CrawlerOverviewStats["breakdown"];
	totalFailures: number;
	windowLabel: string;
}) {
	const t = getComponentT("crawler");

	const categories = (): ReadonlyArray<{
		key: keyof CrawlerOverviewStats["breakdown"];
		label: string;
	}> => [
		{ key: "timeout", label: t("overview.err.timeout") },
		{ key: "rateLimited412Or429", label: t("overview.err.rateLimited") },
		{ key: "networkFailure", label: t("overview.err.networkFailure") },
		{ key: "httpFailure", label: t("overview.err.httpFailure") },
		{ key: "networkOther", label: t("overview.err.networkOther") },
		{ key: "adapterUnavailable", label: t("overview.err.adapterUnavailable") },
		{ key: "bilibiliBusinessError", label: t("overview.err.bilibiliBusiness") },
		{ key: "inferenceError", label: t("overview.err.inference") },
		{ key: "dbError", label: t("overview.err.db") },
		{ key: "other", label: t("overview.err.other") },
	];

	const rows = () => {
		const total = props.totalFailures;
		const all = categories().map((cat) => {
			const count = props.breakdown[cat.key] ?? 0;
			const ratio = total > 0 ? count / total : 0;
			return {
				key: cat.key,
				label: cat.label,
				count,
				ratio,
			};
		});
		if (total === 0) return all;
		// When failures exist, sort active ones to the top
		return all.sort((a, b) => b.count - a.count);
	};

	return (
		<div class="cvsa-scroll overflow-x-auto border border-border bg-surface">
			<table class="w-full text-left ts-caption">
				<thead>
					<tr class="border-b border-border text-tertiary bg-surface-container-high uppercase tracking-wider text-xs">
						<th class="py-2.5 px-4 font-semibold">{t("overview.failures.category")}</th>
						<th class="py-2.5 px-4 font-semibold">{t("overview.failures.count")}</th>
						<th class="py-2.5 px-4 font-semibold">{t("overview.failures.ratio")}</th>
						<th class="py-2.5 px-4 font-semibold">{t("overview.failures.status")}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border text-sm">
					<For each={rows()}>
						{(row) => (
							<tr class="hover:bg-hover transition-colors">
								<td class="py-2.5 px-4 font-medium text-primary flex items-center gap-2">
									<div
										class={clsx(
											"w-2 h-2",
											row.count > 0 ? "bg-error" : "bg-success"
										)}
									/>
									<span>{row.label}</span>
								</td>
								<td class="py-2.5 px-4">
									<Show
										when={row.count > 0}
										fallback={<span class="text-tertiary">0</span>}
									>
										<Badge variant="danger" size="sm">
											{row.count}
										</Badge>
									</Show>
								</td>
								<td class="py-2.5 px-4 text-secondary">
									{formatPercent(row.ratio)}
								</td>
								<td class="py-2.5 px-4">
									<Show
										when={row.count > 0}
										fallback={
											<Badge variant="success" size="sm" dot>
												{t("common.normal")}
											</Badge>
										}
									>
										<Badge variant="danger" size="sm" dot>
											{t("common.error")}
										</Badge>
									</Show>
								</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</div>
	);
}
