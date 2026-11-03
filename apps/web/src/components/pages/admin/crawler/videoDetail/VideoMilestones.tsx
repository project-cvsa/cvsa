import { createSignal, onMount, Show } from "solid-js";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import Button from "@components/ui/Button";
import TextField from "@components/ui/TextField";
import NumberField from "@components/ui/NumberField";
import Select from "@components/ui/Select";
import DataTable, { type TableColumn } from "@components/ui/DataTable";
import { toast } from "@components/ui/Toast";
import {
	MilestoneImportRequestSchema,
	MilestoneBacktestRequestSchema,
	type MilestoneRecord,
	type MilestoneAchievement,
	type MilestoneBacktestResult,
	type MilestoneRecoveryStatus,
} from "@cvsa/contracts";
import { formatDateTime, formatMetric } from "../format";

export default function VideoMilestones(props: { aid: string }) {
	const t = getComponentT("crawler");
	const [achievements, setAchievements] = createSignal<MilestoneAchievement[]>([]);
	const [items, setItems] = createSignal<MilestoneRecord[]>([]);
	const [threshold, setThreshold] = createSignal(100000);
	const [at, setAt] = createSignal("");
	const [kind, setKind] = createSignal<"exact" | "by" | "minute">("by");
	const [note, setNote] = createSignal("");
	const [from, setFrom] = createSignal(new Date(Date.now() - 86400000).toISOString());
	const [to, setTo] = createSignal(new Date().toISOString());
	const [busy, setBusy] = createSignal(false);
	const [result, setResult] = createSignal<MilestoneBacktestResult | null>(null);
	const [recoveryId, setRecoveryId] = createSignal("");
	const [recovery, setRecovery] = createSignal<MilestoneRecoveryStatus | null>(null);
	const load = async () => {
		const response = await api.crawler.getMilestones(props.aid);
		if (response.ok) {
			setItems(response.data?.items ?? []);
			setAchievements(response.data?.achievements ?? []);
		} else toast.error(response.error.message || t("common.error"));
	};
	onMount(() => void load());
	const save = async () => {
		const parsed = MilestoneImportRequestSchema.safeParse({
			items: [
				{
					aid: props.aid,
					threshold: threshold(),
					at: at(),
					timeKind: kind(),
					note: note(),
				},
			],
		});
		if (!parsed.success) {
			toast.error(t("milestones.invalid"));
			return;
		}
		setBusy(true);
		try {
			const response = await api.crawler.importMilestones(parsed.data);
			if (response.ok) {
				await load();
				toast.success(t("common.saved"));
			} else toast.error(response.error.message || t("common.error"));
		} finally {
			setBusy(false);
		}
	};
	const backtest = async () => {
		const parsed = MilestoneBacktestRequestSchema.safeParse({
			aid: props.aid,
			threshold: threshold(),
			from: from(),
			to: to(),
		});
		if (!parsed.success) {
			toast.error(t("milestones.invalid"));
			return;
		}
		setBusy(true);
		try {
			const response = await api.crawler.backtestMilestone(parsed.data);
			if (response.ok) setResult(response.data ?? null);
			else toast.error(response.error.message || t("common.error"));
		} finally {
			setBusy(false);
		}
	};
	const recover = async () => {
		setBusy(true);
		try {
			const response = await api.crawler.recoverMilestones({
				afterAid: "0",
				minimumViews: 100000,
				batchSize: 1000,
			});
			if (response.ok) setRecoveryId(response.data?.jobId ?? "");
			else toast.error(response.error.message || t("common.error"));
		} finally {
			setBusy(false);
		}
	};
	const refreshRecovery = async () => {
		const response = await api.crawler.getMilestoneRecovery(recoveryId());
		if (response.ok) {
			setRecovery(response.data ?? null);
			await load();
		} else toast.error(response.error.message || t("common.error"));
	};
	const achievementColumns: TableColumn<MilestoneAchievement>[] = [
		{
			id: "threshold",
			header: t("milestones.threshold"),
			cell: (row) => formatMetric(row.threshold),
		},
		{
			id: "minute",
			header: t("milestones.minute"),
			cell: (row) =>
				row.reachedMinute ? formatDateTime(row.reachedMinute) : t("milestones.unknown"),
		},
		{
			id: "observed",
			header: t("milestones.observed"),
			cell: (row) => (row.firstObservedAt ? formatDateTime(row.firstObservedAt) : "—"),
		},
	];
	const columns: TableColumn<MilestoneRecord>[] = [
		{
			id: "threshold",
			header: t("milestones.threshold"),
			cell: (row) => formatMetric(row.threshold),
		},
		{ id: "at", header: t("milestones.at"), cell: (row) => formatDateTime(row.at) },
		{
			id: "kind",
			header: t("milestones.kind"),
			cell: (row) => t(`milestones.${row.timeKind}`),
		},
		{
			id: "source",
			header: t("milestones.source"),
			cell: (row) => t(`milestones.${row.source}`),
		},
		{
			id: "previous",
			header: t("milestones.previous"),
			cell: (row) => (row.previousAt ? formatDateTime(row.previousAt) : "—"),
		},
	];
	return (
		<section class="flex flex-col gap-4">
			<h3 class="ts-heading-3 text-primary">{t("milestones.title")}</h3>
			<DataTable
				columns={achievementColumns}
				items={achievements()}
				empty={t("milestones.empty")}
			/>
			<details>
				<summary class="ts-label text-secondary cursor-pointer">
					{t("milestones.sources")}
				</summary>
				<DataTable columns={columns} items={items()} empty={t("milestones.empty")} />
			</details>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<NumberField
					label={t("milestones.threshold")}
					min={1}
					value={threshold()}
					onChange={setThreshold}
				/>
				<TextField
					label={t("milestones.at")}
					helperText={t("milestones.timeHelp")}
					value={at()}
					onInput={(event) => setAt(event.currentTarget.value)}
				/>
				<Select
					label={t("milestones.kind")}
					value={kind()}
					options={[
						{ value: "minute", label: t("milestones.minute") },
						{ value: "by", label: t("milestones.by") },
						{ value: "exact", label: t("milestones.exact") },
					]}
					onValueChange={(value) => {
						if (value === "by" || value === "exact" || value === "minute")
							setKind(value);
					}}
				/>
				<TextField
					label={t("milestones.note")}
					value={note()}
					onInput={(event) => setNote(event.currentTarget.value)}
				/>
			</div>
			<div>
				<Button disabled={busy()} onClick={() => void save()}>
					{t("milestones.import")}
				</Button>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<TextField
					label={t("milestones.from")}
					value={from()}
					onInput={(event) => setFrom(event.currentTarget.value)}
				/>
				<TextField
					label={t("milestones.to")}
					value={to()}
					onInput={(event) => setTo(event.currentTarget.value)}
				/>
			</div>
			<div>
				<Button disabled={busy()} onClick={() => void backtest()}>
					{t("milestones.backtest")}
				</Button>
			</div>
			<Show when={result()}>
				{(value) => (
					<div class="ts-body text-primary flex flex-col gap-2">
						<p>
							{t("milestones.requests")}: {value().requests} ·{" "}
							{t("milestones.minuteResult")}:{" "}
							{t(`milestones.${value().minuteResult}`)}
						</p>
						<p>
							{t("milestones.detectedAt")}:{" "}
							{value().detectedAt ? formatDateTime(value().detectedAt) : "—"}
						</p>
						<p>
							{t("milestones.traceGap")}: {Math.round(value().maxTraceGapMs / 1000)}s
							· {t("milestones.delay")}:{" "}
							{value().delayFromFirstRecordedMs === null
								? "—"
								: `${Math.round((value().delayFromFirstRecordedMs ?? 0) / 1000)}s`}
						</p>
					</div>
				)}
			</Show>
			<div class="flex gap-3">
				<Button disabled={busy()} onClick={() => void recover()}>
					{t("milestones.recover")}
				</Button>
				<Show when={recoveryId()}>
					<Button onClick={() => void refreshRecovery()}>
						{t("milestones.progress")}
					</Button>
				</Show>
			</div>
			<Show when={recovery()}>
				{(value) => (
					<p class="ts-caption text-secondary">
						{t(`audit.${value().state}`)} · {t("milestones.videos")}:{" "}
						{value().data.processed} · {t("milestones.records")}:{" "}
						{value().data.inserted}
					</p>
				)}
			</Show>
		</section>
	);
}
