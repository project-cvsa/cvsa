import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { CRAWLER_CHART_METRICS, type CrawlerStatsRollupPoint } from "@cvsa/contracts";
import Select from "@components/ui/Select";
import { getComponentT } from "@lib/i18n/isomorphic";
import { formatMetric, formatPercent } from "./format";

const PERCENTILES = [
	{ quantile: 0.5, label: "P50", color: "var(--chart-p50)" },
	{ quantile: 0.9, label: "P90", color: "var(--chart-p90)" },
	{ quantile: 0.95, label: "P95", color: "var(--chart-p95)" },
	{ quantile: 0.99, label: "P99", color: "var(--chart-p99)" },
];
const LEFT = 64;
const RIGHT = 16;
const TOP = 20;
const BOTTOM = 196;

type ChartLine = {
	hidden?: boolean;
	label: string;
	color: string;
	points: { time: number; value: number | null }[];
};

export function TrendPlot(props: {
	width: number;
	lines: ChartLine[];
	label: string;
	unit: string;
	format: string;
}) {
	const times = createMemo(() =>
		props.lines.flatMap((line) => line.points.map((point) => point.time))
	);
	const start = createMemo(() => Math.min(...times()));
	const end = createMemo(() => Math.max(...times()));
	const maximum = createMemo(() =>
		props.format === "percent"
			? 1
			: Math.max(
					1,
					...props.lines.flatMap((line) => line.points.map((point) => point.value ?? 0))
				) * 1.1
	);
	const x = (time: number) =>
		LEFT + ((time - start()) / Math.max(1, end() - start())) * (props.width - LEFT - RIGHT);
	const y = (value: number) => BOTTOM - (value / maximum()) * (BOTTOM - TOP);
	const locale = () =>
		typeof document === "undefined" ? undefined : document.documentElement.lang;
	const tick = (value: number) =>
		new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(
			props.format === "percent" ? value * 100 : value
		);
	const timeLabel = (time: number) =>
		new Date(time).toLocaleString(locale(), {
			...(end() - start() >= 86_400_000
				? ({ month: "2-digit", day: "2-digit" } satisfies Intl.DateTimeFormatOptions)
				: {}),
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	const valueLabel = (value: number) =>
		props.format === "percent" ? formatPercent(value) : `${formatMetric(value)} ${props.unit}`;
	const segments = (line: ChartLine) => {
		const result: Array<Array<{ time: number; value: number }>> = [];
		let current: Array<{ time: number; value: number }> = [];
		for (const point of line.points) {
			if (point.value === null) {
				if (current.length) result.push(current);
				current = [];
			} else current.push({ time: point.time, value: point.value });
		}
		if (current.length) result.push(current);
		return result;
	};
	return (
		<svg
			viewBox={`0 0 ${props.width} 236`}
			width="100%"
			height="236"
			class="block text-secondary ts-caption font-body"
			role="img"
			aria-label={props.label}
		>
			<title>{props.label}</title>
			<For each={[0, 0.5, 1]}>
				{(ratio) => (
					<g>
						<line
							x1={LEFT}
							y1={y(maximum() * ratio)}
							x2={props.width - RIGHT}
							y2={y(maximum() * ratio)}
							stroke="currentColor"
							stroke-opacity="0.15"
						/>
						<text
							x={LEFT - 12}
							y={y(maximum() * ratio) + 4}
							text-anchor="end"
							fill="currentColor"
						>
							{tick(maximum() * ratio)}
						</text>
					</g>
				)}
			</For>
			<For each={props.lines.filter((line) => !line.hidden)}>
				{(line) => (
					<For each={segments(line)}>
						{(segment) => (
							<g>
								<path
									d={segment
										.map(
											(point, index) =>
												`${index ? "L" : "M"}${x(point.time)},${y(point.value)}`
										)
										.join(" ")}
									fill="none"
									stroke={line.color}
									stroke-width="2"
									vector-effect="non-scaling-stroke"
									stroke-linejoin="round"
								>
									<title>{line.label}</title>
								</path>
								<For each={segment}>
									{(point) => (
										<circle
											cx={x(point.time)}
											cy={y(point.value)}
											r={segment.length === 1 ? 3 : 5}
											fill={segment.length === 1 ? line.color : "transparent"}
										>
											<title>
												{timeLabel(point.time)} · {line.label}:{" "}
												{valueLabel(point.value)}
											</title>
										</circle>
									)}
								</For>
							</g>
						)}
					</For>
				)}
			</For>
			<For each={props.width < 480 ? [0, 1] : [0, 0.5, 1]}>
				{(ratio) => (
					<text
						x={LEFT + ratio * (props.width - LEFT - RIGHT)}
						y="226"
						text-anchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
						fill="currentColor"
					>
						{timeLabel(start() + ratio * (end() - start()))}
					</text>
				)}
			</For>
		</svg>
	);
}

export default function ThroughputChart(props: {
	series: CrawlerStatsRollupPoint[];
	initialMetric?: string;
}) {
	const t = getComponentT("crawler:metrics");
	const [width, setWidth] = createSignal(800);
	const [metric, setMetric] = createSignal(props.initialMetric ?? "videosPerMin");
	const [hidden, setHidden] = createSignal<string[]>([]);
	let plot: HTMLDivElement | undefined;
	onMount(() => {
		if (!plot) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(plot);
		onCleanup(() => observer.disconnect());
	});
	const selected = () =>
		CRAWLER_CHART_METRICS.find((item) => item.key === metric()) ?? CRAWLER_CHART_METRICS[0];
	const percentiles = () => metric().startsWith("latency.");
	const unit = () => (selected().format === "percent" ? "%" : selected().unit);
	const values = createMemo(() =>
		[...props.series].sort((a, b) => Date.parse(a.bucketTime) - Date.parse(b.bucketTime))
	);
	const allLines = (): ChartLine[] =>
		(percentiles()
			? PERCENTILES.map((item) => ({
					key: `${metric()}.${item.quantile}`,
					label: item.label,
					color: item.color,
				}))
			: [{ key: metric(), label: t(selected().label), color: "var(--primary)" }]
		).map((line) => ({
			...line,
			points: values().map((point) => ({
				time: Date.parse(point.bucketTime),
				value: point.metrics[line.key] ?? null,
			})),
		}));
	const lines = () =>
		allLines().map((line) => ({ ...line, hidden: hidden().includes(line.label) }));
	const hasData = () =>
		allLines().some((line) => line.points.some((point) => point.value !== null));
	return (
		<section class="flex flex-col gap-3" aria-label={t("audit.trends")}>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<h3 class="ts-label text-primary">{t("audit.trends")}</h3>
					<span class="ts-caption text-tertiary">{unit()}</span>
				</div>
				<div class="w-48 max-w-full">
					<Select
						size="sm"
						aria-label={t("audit.metric")}
						value={metric()}
						options={CRAWLER_CHART_METRICS.map((item) => ({
							value: item.key,
							label: t(item.label),
						}))}
						onValueChange={(value) => {
							if (value) {
								setMetric(value);
								setHidden([]);
							}
						}}
					/>
				</div>
			</div>
			<Show when={percentiles()}>
				<fieldset
					class="flex flex-wrap gap-4 border-0 p-0 m-0"
					aria-label={t("audit.legend")}
				>
					<For each={allLines()}>
						{(line) => (
							<button
								type="button"
								class="inline-flex items-center gap-2 bg-transparent border-0 p-0 text-secondary ts-caption cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
								classList={{ "opacity-40": hidden().includes(line.label) }}
								aria-pressed={!hidden().includes(line.label)}
								onClick={() =>
									setHidden((current) =>
										current.includes(line.label)
											? current.filter((label) => label !== line.label)
											: [...current, line.label]
									)
								}
							>
								<span
									class="inline-block w-5 h-0.5"
									style={{ background: line.color }}
									aria-hidden="true"
								/>
								{line.label}
							</button>
						)}
					</For>
				</fieldset>
			</Show>
			<div ref={plot} class="w-full min-w-0 bg-surface p-2">
				<Show
					when={hasData()}
					fallback={
						<div class="py-10 text-center ts-caption text-tertiary">
							{t("audit.noHistory")}
						</div>
					}
				>
					<TrendPlot
						width={Math.max(240, width())}
						lines={lines()}
						label={t(selected().label)}
						unit={unit()}
						format={selected().format}
					/>
				</Show>
			</div>
		</section>
	);
}
