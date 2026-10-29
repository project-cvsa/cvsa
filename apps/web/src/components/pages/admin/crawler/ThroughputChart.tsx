import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { CrawlerStatsRollupPoint } from "@cvsa/contracts";
import Select from "@components/ui/Select";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric } from "./format";

const METRICS = [
	{ key: "snapshotsPerMin", label: "snapshots", unit: "/min" },
	{ key: "requestsPerSec", label: "requests", unit: "/s" },
	{ key: "errorPercent", label: "errors", unit: "%" },
	{ key: "retryPercent", label: "retries", unit: "%" },
	{ key: "latencyP95Ms.api", label: "apiLatency", unit: "ms" },
	{ key: "latencyP95Ms.task", label: "taskLatency", unit: "ms" },
	{ key: "queue.waiting", label: "backlog", unit: "" },
	{ key: "queue.active", label: "workers", unit: "" },
];

type PlotPoint = { time: number; value: number; x: number; y: number };

function TrendPlot(props: {
	width: number;
	maximum: number;
	points: PlotPoint[];
	path: string;
	label: string;
	unit: string;
}) {
	const timeLabel = (time: number) =>
		new Date(time).toLocaleString(document.documentElement.lang, {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	return (
		<svg
			viewBox={`0 0 ${props.width} 240`}
			width="100%"
			height="240"
			class="block text-primary"
			role="img"
			aria-label={`${props.label} ${props.unit}`}
		>
			<title>{props.label}</title>
			<For each={[0, 0.5, 1]}>
				{(ratio) => (
					<g>
						<line
							x1="76"
							y1={196 - ratio * 172}
							x2={props.width - 16}
							y2={196 - ratio * 172}
							stroke="currentColor"
							stroke-opacity="0.15"
						/>
						<text
							x="66"
							y={200 - ratio * 172}
							text-anchor="end"
							fill="currentColor"
							font-size="11"
						>
							{formatMetric(props.maximum * ratio)}
							{props.unit}
						</text>
					</g>
				)}
			</For>
			<path
				d={props.path}
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				vector-effect="non-scaling-stroke"
				stroke-linejoin="round"
			/>
			<For
				each={props.points.filter(
					(_, index, rows) =>
						index === 0 ||
						index === rows.length - 1 ||
						index === Math.floor(rows.length / 2)
				)}
			>
				{(point) => (
					<text
						x={point.x}
						y="228"
						text-anchor={
							point.x === 76
								? "start"
								: point.x === props.width - 16
									? "end"
									: "middle"
						}
						fill="currentColor"
						font-size="11"
					>
						{timeLabel(point.time)}
					</text>
				)}
			</For>
		</svg>
	);
}

export default function ThroughputChart(props: { series: CrawlerStatsRollupPoint[] }) {
	const t = getComponentT("crawler");
	const [width, setWidth] = createSignal(800);
	let plot: HTMLDivElement | undefined;
	onMount(() => {
		if (!plot) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(Math.max(300, entry.contentRect.width));
		});
		observer.observe(plot);
		onCleanup(() => observer.disconnect());
	});
	const [metric, setMetric] = createSignal("snapshotsPerMin");
	const selected = () => METRICS.find((item) => item.key === metric()) ?? METRICS[0];
	const points = createMemo(() =>
		props.series
			.flatMap((point) => {
				const value = point.metrics[metric()];
				const time = Date.parse(point.bucketTime);
				return value === undefined || !Number.isFinite(time) ? [] : [{ time, value }];
			})
			.sort((a, b) => a.time - b.time)
	);
	const maximum = () => Math.max(1, ...points().map((point) => point.value)) * 1.1;
	const coordinates = createMemo(() => {
		const rows = points();
		const start = rows[0]?.time ?? 0;
		const end = rows[rows.length - 1]?.time ?? start;
		return rows.map((point) => ({
			...point,
			x: 76 + ((point.time - start) / Math.max(1, end - start)) * (width() - 92),
			y: 196 - (point.value / maximum()) * 172,
		}));
	});
	const path = () =>
		coordinates()
			.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
			.join(" ");

	return (
		<section class="flex flex-col gap-3" aria-label={t("audit.trends")}>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h3 class="ts-label text-primary">{t("audit.trends")}</h3>
				<div class="w-48">
					<Select
						size="sm"
						aria-label={t("audit.metric")}
						value={metric()}
						options={METRICS.map((item) => ({
							value: item.key,
							label: `${t(`audit.chart.${item.label}`)} ${item.unit}`,
						}))}
						onValueChange={(value) => {
							if (value) setMetric(value);
						}}
					/>
				</div>
			</div>
			<div ref={plot} class="w-full min-w-0">
				<Show
					when={points().length >= 2}
					fallback={
						<div class="py-10 border-y border-border text-center ts-caption text-tertiary">
							{t("audit.noHistory")}
						</div>
					}
				>
					<TrendPlot
						width={width()}
						maximum={maximum()}
						points={coordinates()}
						path={path()}
						label={t(`audit.chart.${selected()?.label}`)}
						unit={selected()?.unit ?? ""}
					/>
				</Show>
			</div>
		</section>
	);
}
