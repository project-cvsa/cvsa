import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { CRAWLER_CHART_METRICS, type CrawlerStatsRollupPoint } from "@cvsa/contracts";
import Select from "@components/ui/Select";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric, formatPercent } from "./format";

const METRICS = CRAWLER_CHART_METRICS;

type PlotPoint = { time: number; value: number; x: number; y: number };

function formatValue(value: number, format: string, unit: string): string {
	return format === "percent" ? formatPercent(value) : `${formatMetric(value)}${unit}`;
}

function TrendPlot(props: {
	width: number;
	maximum: number;
	segments: PlotPoint[][];
	points: { time: number; x: number }[];
	label: string;
	unit: string;
	format: string;
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
							{formatValue(props.maximum * ratio, props.format, props.unit)}
						</text>
					</g>
				)}
			</For>
			<For each={props.segments}>
				{(segment) => (
					<path
						d={segment
							.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
							.join(" ")}
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						vector-effect="non-scaling-stroke"
						stroke-linejoin="round"
					/>
				)}
			</For>
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
	const [metric, setMetric] = createSignal("videosPerMin");
	const selected = () => METRICS.find((item) => item.key === metric()) ?? METRICS[0];
	const values = createMemo(() =>
		props.series
			.flatMap((point) => {
				const value = point.metrics[metric()];
				const time = Date.parse(point.bucketTime);
				return Number.isFinite(time) ? [{ time, value }] : [];
			})
			.sort((a, b) => a.time - b.time)
	);
	const maximum = () => Math.max(1, ...values().map((point) => point.value ?? 0)) * 1.1;
	const start = () => values()[0]?.time ?? 0;
	const end = () => values()[values().length - 1]?.time ?? start();
	const x = (time: number) =>
		76 + ((time - start()) / Math.max(1, end() - start())) * (width() - 92);
	const coordinates = createMemo(() =>
		values().map((point) => ({
			time: point.time,
			x: x(point.time),
			value: point.value,
		}))
	);
	const segments = createMemo(() => {
		const result: PlotPoint[][] = [];
		let current: PlotPoint[] = [];
		for (const point of coordinates()) {
			if (point.value === null) {
				if (current.length > 0) result.push(current);
				current = [];
				continue;
			}
			current.push({
				time: point.time,
				x: point.x,
				value: point.value,
				y: 196 - (point.value / maximum()) * 172,
			});
		}
		if (current.length > 0) result.push(current);
		return result;
	});
	const labels = createMemo(() => coordinates().map(({ time, x }) => ({ time, x })));

	return (
		<section class="flex flex-col gap-3" aria-label={t("audit.trends")}>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h3 class="ts-label text-primary">{t("audit.trends")}</h3>
				<div class="w-56">
					<Select
						size="sm"
						aria-label={t("audit.metric")}
						value={metric()}
						options={METRICS.map((item) => ({
							value: item.key,
							label: `${t(item.label)} ${item.unit}`,
						}))}
						onValueChange={(value) => {
							if (value) setMetric(value);
						}}
					/>
				</div>
			</div>
			<div ref={plot} class="w-full min-w-0">
				<Show
					when={segments().some((segment) => segment.length >= 2)}
					fallback={
						<div class="py-10 border-y border-border text-center ts-caption text-tertiary">
							{t("audit.noHistory")}
						</div>
					}
				>
					<TrendPlot
						width={width()}
						maximum={maximum()}
						segments={segments()}
						points={labels()}
						label={t(selected()?.label ?? "overview.newSnapshots")}
						unit={selected()?.unit ?? ""}
						format={selected()?.format ?? "number"}
					/>
				</Show>
			</div>
		</section>
	);
}
