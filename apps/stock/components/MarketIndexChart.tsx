"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { MarketIndex } from "@/lib/stock-data";
import { getChangeColor } from "@/lib/colors";
import { useColorMode } from "@/components/ColorModeContext";
import { STEP_HOURS, STEP_PER_WINDOW } from "@/lib/stock-constants";

const STEP_HOURS_MS = STEP_HOURS * 3600 * 1000;

interface MarketIndexChartProps {
	data: MarketIndex;
}

export function MarketIndexChart({ data }: MarketIndexChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const { mode } = useColorMode();
	const color = getChangeColor(mode, data.changePercent);
	const isIndex = data.pointIntervalMs !== undefined;
	const stepMs = data.pointIntervalMs ?? STEP_HOURS_MS;
	const totalPoints = data.history.length;

	useEffect(() => {
		if (!containerRef.current) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				setDimensions({ width, height });
			}
		});
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;
		if (totalPoints === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const isMobile = dimensions.width < 500;
		const margin = { top: 30, right: 15, bottom: 30, left: isMobile ? 45 : 55 };
		const width = dimensions.width - margin.left - margin.right;
		const height = dimensions.height - margin.top - margin.bottom;

		const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

		const xScale = d3
			.scaleLinear()
			.domain([0, totalPoints - 1])
			.range([0, width]);

		const yMin = d3.min(data.history) ?? 0;
		const yMax = d3.max(data.history) ?? 100;
		const yPadding = (yMax - yMin) * 0.15;

		const yScale = d3
			.scaleLinear()
			.domain([yMin - yPadding, yMax + yPadding])
			.range([height, 0]);

		const baseTime = new Date(data.baseTime);

		function formatLabel(index: number): string {
			if (!isIndex) {
				const hoursAgo = (totalPoints - 1 - index) * STEP_HOURS;
				const d = new Date(baseTime.getTime() - hoursAgo * 3600 * 1000);
				return `${d.getMonth() + 1}/${d.getDate()}`;
			}
			const msAgo = (totalPoints - 1 - index) * stepMs;
			const d = new Date(baseTime.getTime() - msAgo);
			const rangeDays = ((totalPoints - 1) * stepMs) / (24 * 3600 * 1000);
			if (rangeDays <= 2) return `${d.getHours()}:00`;
			if (rangeDays <= 7) return `${d.getMonth() + 1}/${d.getDate()}`;
			return `${d.getMonth() + 1}/${d.getDate()}`;
		}

		let dayTicks: number[];
		if (isIndex) {
			const rangeMs = (totalPoints - 1) * stepMs;
			const rangeDays = rangeMs / (24 * 3600 * 1000);
			let tickStepDays: number;
			if (rangeDays <= 2) tickStepDays = 4 / 24;
			else if (rangeDays <= 7) tickStepDays = 1;
			else if (rangeDays <= 30) tickStepDays = 3;
			else if (rangeDays <= 90) tickStepDays = 7;
			else tickStepDays = 14;
			const tickStepMs = tickStepDays * 24 * 3600 * 1000;

			dayTicks = [];
			const earliest = new Date(baseTime.getTime() - (totalPoints - 1) * stepMs);
			const cursor = new Date(Math.ceil(earliest.getTime() / tickStepMs) * tickStepMs);

			while (cursor <= baseTime) {
				const msFromEnd = baseTime.getTime() - cursor.getTime();
				const idx = totalPoints - 1 - Math.round(msFromEnd / stepMs);
				if (idx >= 0 && idx < totalPoints) {
					dayTicks.push(idx);
				}
				cursor.setTime(cursor.getTime() + tickStepMs);
			}
		} else {
			const tickInterval =
				totalPoints <= 50 ? STEP_PER_WINDOW
				: totalPoints <= 100 ? STEP_PER_WINDOW * 2
				: totalPoints <= 300 ? STEP_PER_WINDOW * 7
				: totalPoints <= 600 ? STEP_PER_WINDOW * 14
				: STEP_PER_WINDOW * 30;

			dayTicks = [];
			const hoursToShift = baseTime.getHours() / STEP_HOURS;
			const firstMidnight = totalPoints - 1 - hoursToShift;
			for (let i = firstMidnight; i >= 0; i -= tickInterval) {
				dayTicks.push(i);
			}
			dayTicks.reverse();
		}

		const xAxis = d3
			.axisBottom(xScale)
			.tickValues(dayTicks)
			.tickSize(4)
			.tickFormat((d) => formatLabel(Math.round(d as number)));

		g.append("g")
			.attr("transform", `translate(0,${height})`)
			.call(xAxis)
			.call((g2) => g2.select(".domain").remove())
			.call((g2) => g2.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"))
			.call((g2) =>
				g2
					.selectAll(".tick text")
					.attr("fill", "#71717a")
					.attr("font-size", isMobile ? "10px" : "11px")
					.attr("font-family", "Inter"),
			);

		const yAxis = d3
			.axisLeft(yScale)
			.ticks(6)
			.tickSize(4)
			.tickSizeOuter(0)
			.tickFormat((d) => {
				const val = d as number;
				if (val >= 10000) return `${(val / 1000).toLocaleString("en-US")}k`;
				return Math.round(val).toLocaleString("en-US");
			});

		g.append("g")
			.call(yAxis)
			.call((g2) => g2.select(".domain").remove())
			.call((g2) => g2.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"))
			.call((g2) =>
				g2
					.selectAll(".tick text")
					.attr("fill", "#71717a")
					.attr("font-size", isMobile ? "10px" : "11px")
					.attr("font-family", "Inter"),
			);

		const line = d3
			.line<number>()
			.x((_, i) => xScale(i))
			.y((d) => yScale(d))
			.curve(d3.curveCatmullRom.alpha(0));

		const area = d3
			.area<number>()
			.x((_, i) => xScale(i))
			.y0(height)
			.y1((d) => yScale(d))
			.curve(d3.curveCatmullRom.alpha(0));

		const gradientId = `gradient-${Math.random().toString(36).slice(2)}`;
		const defs = svg.append("defs");

		const gradient = defs
			.append("linearGradient")
			.attr("id", gradientId)
			.attr("x1", "0%")
			.attr("y1", "0%")
			.attr("x2", "0%")
			.attr("y2", "100%");

		gradient
			.append("stop")
			.attr("offset", "0%")
			.attr("stop-color", color)
			.attr("stop-opacity", 0.3);
		gradient
			.append("stop")
			.attr("offset", "100%")
			.attr("stop-color", color)
			.attr("stop-opacity", 0);

		g.append("path").datum(data.history).attr("fill", `url(#${gradientId})`).attr("d", area);

		const path = g
			.append("path")
			.datum(data.history)
			.attr("fill", "none")
			.attr("stroke", color)
			.attr("stroke-width", 2)
			.attr("d", line);

		const pathLen = path.node()?.getTotalLength() ?? 0;
		path
			.attr("stroke-dasharray", pathLen)
			.attr("stroke-dashoffset", pathLen)
			.transition()
			.duration(1500)
			.ease(d3.easeCubicOut)
			.attr("stroke-dashoffset", 0);

		if (data.openValue !== undefined && data.openValue > 0) {
			const mondayUtc = new Date(baseTime);
			const dow = mondayUtc.getUTCDay();
			mondayUtc.setUTCDate(mondayUtc.getUTCDate() - (dow === 0 ? 6 : dow - 1));
			mondayUtc.setUTCHours(0, 0, 0, 0);

			const msFromEnd = baseTime.getTime() - mondayUtc.getTime();
			const openIdx = Math.round(msFromEnd / stepMs);
			if (openIdx >= 0 && openIdx < totalPoints) {
				const ox = xScale(totalPoints - 1 - openIdx);

				g.append("line")
					.attr("x1", ox)
					.attr("x2", ox)
					.attr("y1", 0)
					.attr("y2", height)
					.attr("stroke", "rgba(255,255,255,0.2)")
					.attr("stroke-dasharray", "4 4");

				g.append("text")
					.attr("x", ox + 4)
					.attr("y", 12)
					.attr("fill", "rgba(255,255,255,0.4)")
					.attr("font-size", "10px")
					.attr("font-family", "sans-serif")
					.text("开盘");
			}
		}

		if (data.highValue !== undefined || data.lowValue !== undefined) {
			const statsBox = g.append("g");
			let yOffset = 0;

			const addStat = (label: string, value: number, valueColor: string) => {
				const txt = statsBox
					.append("text")
					.attr("x", width)
					.attr("y", yOffset)
					.attr("text-anchor", "end")
					.attr("font-size", "10px")
					.attr("font-family", "Inter");
				txt.append("tspan").attr("fill", "#71717a").text(`${label} `);
				txt
					.append("tspan")
					.attr("fill", valueColor)
					.attr("font-weight", "600")
					.text(value.toLocaleString("en-US", { maximumFractionDigits: 0 }));
				yOffset += 14;
			};

			if (data.highValue !== undefined && data.highValue > 0)
				addStat("H", data.highValue, "#ef4444");
			if (data.lowValue !== undefined && data.lowValue > 0)
				addStat("L", data.lowValue, "#22c55e");
		}

		const crosshairGroup = g.append("g").attr("class", "crosshair").style("opacity", 0);
		const crosshairLine = crosshairGroup
			.append("line")
			.attr("y1", 0)
			.attr("y2", height)
			.attr("stroke", "rgba(255,255,255,0.3)")
			.attr("stroke-width", 1);
		const crosshairCircle = crosshairGroup
			.append("circle")
			.attr("r", 4)
			.attr("fill", color)
			.attr("stroke", "white")
			.attr("stroke-width", 2);

		const tooltipGroup = g.append("g").attr("class", "tooltip").style("opacity", 0);
		const tooltipRect = tooltipGroup
			.append("rect")
			.attr("fill", "#18181b")
			.attr("stroke", "rgba(255,255,255,0.1)")
			.attr("rx", 6);
		const tooltipText = tooltipGroup
			.append("text")
			.attr("fill", "white")
			.attr("font-size", "12px")
			.attr("font-family", "Inter")
			.attr("text-anchor", "middle")
			.attr("dominant-baseline", "middle");
		const tooltipTime = tooltipGroup
			.append("text")
			.attr("fill", "#71717a")
			.attr("font-size", "10px")
			.attr("font-family", "sans-serif")
			.attr("text-anchor", "middle")
			.attr("dominant-baseline", "middle");

		const overlay = g
			.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("fill", "transparent")
			.attr("pointer-events", "all")
			.style("touch-action", "none");

		const handlePointerMove = (event: PointerEvent) => {
			const [mouseX] = d3.pointer(event, svg.node() as SVGSVGElement);
			const adjX = mouseX - margin.left;
			if (adjX < 0 || adjX > width) {
				crosshairGroup.style("opacity", 0);
				tooltipGroup.style("opacity", 0);
				return;
			}
			const x0 = xScale.invert(adjX);
			const i = Math.max(0, Math.min(totalPoints - 1, Math.round(x0)));
			const d = data.history[i];
			const x = xScale(i);
			const y = yScale(d);

			crosshairGroup.style("opacity", 1);
			crosshairLine.attr("x1", x).attr("x2", x);
			crosshairCircle.attr("cx", x).attr("cy", y);

			tooltipText.text(
				d.toLocaleString("en-US", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}),
			);

			if (isIndex) {
				const msAgo = (totalPoints - 1 - i) * stepMs;
				const labelDate = new Date(baseTime.getTime() - msAgo);
				tooltipTime.text(
					`${labelDate.getMonth() + 1}/${labelDate.getDate()} ${labelDate.getHours()}:${String(labelDate.getMinutes()).padStart(2, "0")}`,
				);
			} else {
				const hoursAgo = (totalPoints - 1 - i) * STEP_HOURS;
				const labelDate = new Date(baseTime.getTime() - hoursAgo * 3600 * 1000);
				tooltipTime.text(
					`${labelDate.getMonth() + 1}/${labelDate.getDate()} ${labelDate.getHours()}时`,
				);
			}

			const tb = tooltipText.node()?.getBBox() ?? { width: 60, height: 16 };
			const tib = tooltipTime.node()?.getBBox() ?? { width: 60, height: 16 };
			const pad = 8;
			const rw = Math.max(tb.width, tib.width) + pad * 2;
			const rh = tb.height + tib.height + pad * 2;
			tooltipRect.attr("width", rw).attr("height", rh);

			let tx: number;
			let ty: number;
			if (isMobile) {
				tx = x - rw / 2;
				ty = y - rh - 12;
			} else {
				tx = x > width / 2 ? x - rw - 12 : x + 12;
				ty = y - rh / 2;
			}
			tx = Math.max(0, Math.min(width - rw, tx));
			ty = Math.max(0, Math.min(height - rh, ty));
			tooltipGroup.attr("transform", `translate(${tx},${ty})`);
			tooltipText.attr("x", rw / 2).attr("y", rh / 2 - 6);
			tooltipTime.attr("x", rw / 2).attr("y", rh / 2 + 10);
			tooltipGroup.style("opacity", 1);
		};

		overlay.on("pointermove", handlePointerMove);
		overlay.on("pointerleave", () => {
			crosshairGroup.style("opacity", 0);
			tooltipGroup.style("opacity", 0);
		});
	}, [data, dimensions, color, stepMs, totalPoints, isIndex]);

	return (
		<div ref={containerRef} className="relative w-full h-full">
			<svg
				ref={svgRef}
				width={dimensions.width}
				height={dimensions.height}
				className="absolute inset-0"
			/>
		</div>
	);
}
