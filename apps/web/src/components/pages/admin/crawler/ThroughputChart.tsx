import { createMemo, createSignal, For, Show } from "solid-js";
import type { CrawlerStatsRollupPoint } from "@cvsa/contracts";
import { formatMetric } from "./format";

type ChartMetricMode = "throughput" | "errors" | "latency";

type ThroughputChartProps = {
	series: CrawlerStatsRollupPoint[];
};

export default function ThroughputChart(props: ThroughputChartProps) {
	const [mode, setMode] = createSignal<ChartMetricMode>("throughput");

	const points = createMemo(() => {
		const raw = props.series;
		if (!raw || raw.length < 2) return [];
		return raw.map((point) => {
			const snapshots =
				point.metrics.snapshotsPerMin ??
				point.metrics["snapshots.count"] ??
				point.metrics["counters.snapshotsSaved"] ??
				0;
			const requests =
				point.metrics.requestsPerSec ??
				point.metrics["requests.count"] ??
				point.metrics["counters.networkRequests"] ??
				0;
			const jobs =
				point.metrics.jobsPerMin ??
				point.metrics["jobs.count"] ??
				point.metrics["counters.jobsCompleted"] ??
				0;
			const errors =
				point.metrics.networkFailures ??
				point.metrics["errors.total"] ??
				point.metrics["counters.networkFailures"] ??
				0;
			const retries = point.metrics.retries ?? point.metrics["counters.retries"] ?? 0;
			const apiLatency =
				point.metrics.apiP95 ??
				point.metrics["latencyP95Ms.api"] ??
				point.metrics["latencyMs.apiP95"] ??
				0;
			const taskLatency =
				point.metrics.taskP95 ??
				point.metrics["latencyP95Ms.task"] ??
				point.metrics["latencyMs.taskP95"] ??
				0;

			return {
				time: new Date(point.bucketTime).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
				snapshots,
				requests,
				jobs,
				errors,
				retries,
				apiLatency,
				taskLatency,
			};
		});
	});

	const seriesMeta = createMemo(() => {
		const m = mode();
		if (m === "errors") {
			return {
				primaryLabel: "网络与业务故障 (Failures)",
				primaryColor: "#f43f5e", // rose-500
				secondaryLabel: "请求重试 (Retries)",
				secondaryColor: "#f59e0b", // amber-500
				getPrimary: (p: ReturnType<typeof points>[number]) => p.errors,
				getSecondary: (p: ReturnType<typeof points>[number]) => p.retries,
				unit: "次",
			};
		}
		if (m === "latency") {
			return {
				primaryLabel: "API P95 延迟",
				primaryColor: "#8b5cf6", // violet-500
				secondaryLabel: "Task P95 延迟",
				secondaryColor: "#06b6d4", // cyan-500
				getPrimary: (p: ReturnType<typeof points>[number]) => p.apiLatency,
				getSecondary: (p: ReturnType<typeof points>[number]) => p.taskLatency,
				unit: "ms",
			};
		}
		return {
			primaryLabel: "快照入库 (Snapshots/min)",
			primaryColor: "#10b981", // emerald-500
			secondaryLabel: "网络请求 (Requests/sec)",
			secondaryColor: "#38bdf8", // sky-400
			getPrimary: (p: ReturnType<typeof points>[number]) => p.snapshots,
			getSecondary: (p: ReturnType<typeof points>[number]) => p.requests,
			unit: "req",
		};
	});

	const maxVal = createMemo(() => {
		let max = 1;
		const meta = seriesMeta();
		for (const p of points()) {
			const v1 = meta.getPrimary(p);
			const v2 = meta.getSecondary(p);
			if (v1 > max) max = v1;
			if (v2 > max) max = v2;
		}
		return max * 1.15; // 15% headroom
	});

	const width = 800;
	const height = 150;
	const padTop = 15;
	const padBottom = 25;
	const padLeft = 45;
	const padRight = 15;

	const chartW = width - padLeft - padRight;
	const chartH = height - padTop - padBottom;

	const coords = createMemo(() => {
		const pts = points();
		if (pts.length < 2) return [];
		const max = maxVal();
		const meta = seriesMeta();
		return pts.map((p, idx) => {
			const x = padLeft + (idx / (pts.length - 1)) * chartW;
			const yPrimary = padTop + chartH - (meta.getPrimary(p) / max) * chartH;
			const ySecondary = padTop + chartH - (meta.getSecondary(p) / max) * chartH;
			return {
				x,
				yPrimary,
				ySecondary,
				time: p.time,
				v1: meta.getPrimary(p),
				v2: meta.getSecondary(p),
			};
		});
	});

	const primaryPath = createMemo(() => {
		const c = coords();
		if (c.length < 2) return "";
		return c
			.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.yPrimary.toFixed(1)}`)
			.join(" ");
	});

	const secondaryPath = createMemo(() => {
		const c = coords();
		if (c.length < 2) return "";
		return c
			.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.ySecondary.toFixed(1)}`)
			.join(" ");
	});

	return (
		<Show when={coords().length >= 2}>
			<div class="border border-border bg-surface p-4 flex flex-col gap-3">
				<div class="flex flex-wrap items-center justify-between gap-3 text-xs">
					{/* Metric Switcher Tabs */}
					<div class="flex items-center border border-border bg-surface-container-low h-7">
						<button
							type="button"
							class={
								"px-2.5 h-full transition-colors select-none font-medium " +
								(mode() === "throughput"
									? "bg-primary text-display-inverted"
									: "text-secondary hover:text-primary hover:bg-hover")
							}
							onClick={() => setMode("throughput")}
						>
							吞吐速率 (Throughput)
						</button>
						<button
							type="button"
							class={
								"px-2.5 h-full transition-colors select-none font-medium " +
								(mode() === "errors"
									? "bg-primary text-display-inverted"
									: "text-secondary hover:text-primary hover:bg-hover")
							}
							onClick={() => setMode("errors")}
						>
							异常与重试 (Errors & Retries)
						</button>
						<button
							type="button"
							class={
								"px-2.5 h-full transition-colors select-none font-medium " +
								(mode() === "latency"
									? "bg-primary text-display-inverted"
									: "text-secondary hover:text-primary hover:bg-hover")
							}
							onClick={() => setMode("latency")}
						>
							延迟分布 (Latency P95)
						</button>
					</div>

					{/* Legend */}
					<div class="flex items-center gap-4 text-xs font-mono">
						<span class="flex items-center gap-1.5">
							<span
								class="w-3 h-0.5 inline-block"
								style={{ "background-color": seriesMeta().primaryColor }}
							/>
							<span class="text-secondary">{seriesMeta().primaryLabel}</span>
						</span>
						<span class="flex items-center gap-1.5">
							<span
								class="w-3 h-0.5 inline-block"
								style={{ "background-color": seriesMeta().secondaryColor }}
							/>
							<span class="text-secondary">{seriesMeta().secondaryLabel}</span>
						</span>
					</div>
				</div>

				<div class="w-full overflow-hidden">
					<svg
						viewBox={`0 0 ${width} ${height}`}
						class="w-full h-36"
						role="img"
						aria-label="Metrics Trend Chart"
					>
						<title>Metrics Trend</title>
						{/* Horizontal grid lines */}
						<line
							x1={padLeft}
							y1={padTop}
							x2={width - padRight}
							y2={padTop}
							stroke="currentColor"
							stroke-opacity="0.08"
						/>
						<line
							x1={padLeft}
							y1={padTop + chartH / 2}
							x2={width - padRight}
							y2={padTop + chartH / 2}
							stroke="currentColor"
							stroke-opacity="0.08"
						/>
						<line
							x1={padLeft}
							y1={padTop + chartH}
							x2={width - padRight}
							y2={padTop + chartH}
							stroke="currentColor"
							stroke-opacity="0.15"
						/>

						{/* Y labels */}
						<text
							x={padLeft - 8}
							y={padTop + 4}
							text-anchor="end"
							class="text-[10px] fill-tertiary font-mono"
						>
							{formatMetric(Math.round(maxVal()))}
						</text>
						<text
							x={padLeft - 8}
							y={padTop + chartH / 2 + 3}
							text-anchor="end"
							class="text-[10px] fill-tertiary font-mono"
						>
							{formatMetric(Math.round(maxVal() / 2))}
						</text>
						<text
							x={padLeft - 8}
							y={padTop + chartH + 3}
							text-anchor="end"
							class="text-[10px] fill-tertiary font-mono"
						>
							0
						</text>

						{/* Primary Line */}
						<path
							d={primaryPath()}
							fill="none"
							stroke={seriesMeta().primaryColor}
							stroke-width="1.75"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						{/* Secondary Line */}
						<path
							d={secondaryPath()}
							fill="none"
							stroke={seriesMeta().secondaryColor}
							stroke-width="1.75"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>

						{/* X axis labels (sparse) */}
						<For
							each={coords().filter(
								(_, i, arr) => i % Math.max(1, Math.floor(arr.length / 5)) === 0
							)}
						>
							{(pt) => (
								<text
									x={pt.x}
									y={height - 6}
									text-anchor="middle"
									class="text-[10px] fill-tertiary font-mono"
								>
									{pt.time}
								</text>
							)}
						</For>
					</svg>
				</div>
			</div>
		</Show>
	);
}
