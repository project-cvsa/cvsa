"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { MarketIndex } from "@/lib/stock-data";
import { getChangeColor } from "@/lib/colors";
import { useColorMode } from "@/components/ColorModeContext";

interface MarketIndexChartProps {
	data: MarketIndex;
}

export function MarketIndexChart({ data }: MarketIndexChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const { mode } = useColorMode();

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

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const isMobile = dimensions.width < 500;
		const margin = {
			top: 10,
			right: 15,
			bottom: 30,
			left: isMobile ? 45 : 55,
		};
		const width = dimensions.width - margin.left - margin.right;
		const height = dimensions.height - margin.top - margin.bottom;

		const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

		const xScale = d3
			.scaleLinear()
			.domain([0, data.history.length - 1])
			.range([0, width]);

		const yMin = d3.min(data.history) ?? 0;
		const yMax = d3.max(data.history) ?? 100;
		const yPadding = (yMax - yMin) * 0.1;

		const yScale = d3
			.scaleLinear()
			.domain([yMin - yPadding, yMax + yPadding])
			.range([height, 0]);

		const totalPoints = data.history.length;
		const baseTime = new Date(data.baseTime);

		const tickInterval = totalPoints <= 50 ? 4
			: totalPoints <= 100 ? 8
			: totalPoints <= 300 ? 28
			: totalPoints <= 600 ? 56
			: 120;

		const dayTicks: number[] = [];
		const hoursToShift = baseTime.getHours() / 6;
		const firstMidnight = totalPoints - 1 - hoursToShift;
		for (let i = firstMidnight; i >= 0; i -= tickInterval) {
			dayTicks.push(i);
		}
		dayTicks.reverse();

		function formatDateLabel(index: number, showHour = false): string {
			const hoursAgo = (totalPoints - 1 - index) * 6;
			const d = new Date(baseTime.getTime() - hoursAgo * 3600 * 1000);
			const month = d.getMonth() + 1;
			const day = d.getDate();
			const hour = d.getHours();
			const hourText = showHour ? `${hour}时` : "";
			if (showHour) {
				return `${month}月${day}日${hourText}`;
			}
			if (tickInterval >= 120) {
				return `${month}月`;
			}
			return `${month}/${day}`;
		}

		const xAxis = d3
			.axisBottom(xScale)
			.tickValues(dayTicks)
			.tickSize(4)
			.tickFormat((d) => formatDateLabel(Math.round(d as number)));

		g.append("g")
			.attr("transform", `translate(0,${height})`)
			.call(xAxis)
			.call((g) => g.select(".domain").remove())
			.call((g) => g.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"))
			.call((g) =>
				g
					.selectAll(".tick text")
					.attr("fill", "#71717a")
					.attr("font-size", isMobile ? "10px" : "11px")
					.attr("font-family", "Inter")
					.attr("font-variant-numeric", "tabular-nums")
			);

		const yAxis = d3
			.axisLeft(yScale)
			.ticks(4)
			.tickSize(4)
			.tickSizeOuter(0)
			.tickFormat((d) => {
				const value = d as number;
				if (value >= 10000) {
					return `${(value / 1000).toLocaleString("en-US")}k`;
				}
				return Math.round(value).toLocaleString("en-US");
			});

		g.append("g")
			.call(yAxis)
			.call((g) => g.select(".domain").remove())
			.call((g) => g.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"))
			.call((g) =>
				g
					.selectAll(".tick text")
					.attr("fill", "#71717a")
					.attr("font-size", isMobile ? "10px" : "11px")
					.attr("font-family", "Inter")
					.attr("font-variant-numeric", "tabular-nums")
			);

		const line = d3
			.line<number>()
			.x((_, i) => xScale(i))
			.y((d) => yScale(d))
			.curve(d3.curveCatmullRom.alpha(0.5));

		const area = d3
			.area<number>()
			.x((_, i) => xScale(i))
			.y0(height)
			.y1((d) => yScale(d))
			.curve(d3.curveCatmullRom.alpha(0.5));

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
			.attr("stop-color", getChangeColor(mode, data.change))
			.attr("stop-opacity", 0.3);

		gradient
			.append("stop")
			.attr("offset", "100%")
			.attr("stop-color", getChangeColor(mode, data.change))
			.attr("stop-opacity", 0);

		g.append("path").datum(data.history).attr("fill", `url(#${gradientId})`).attr("d", area);

		const path = g
			.append("path")
			.datum(data.history)
			.attr("fill", "none")
			.attr("stroke", getChangeColor(mode, data.change))
			.attr("stroke-width", 2.5)
			.attr("d", line);

		const pathLength = path.node()?.getTotalLength() ?? 0;
		path.attr("stroke-dasharray", pathLength)
			.attr("stroke-dashoffset", pathLength)
			.transition()
			.duration(1500)
			.ease(d3.easeCubicOut)
			.attr("stroke-dashoffset", 0);

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
			.attr("fill", getChangeColor(mode, data.change))
			.attr("stroke", "white")
			.attr("stroke-width", 2);

		const tooltipGroup = g.append("g").attr("class", "tooltip").style("opacity", 0);

		const tooltipRect = tooltipGroup
			.append("rect")
			.attr("fill", "#18181b")
			.attr("stroke", "rgba(255,255,255,0.1)")
			.attr("rx", 6)
			.attr("ry", 6);

		const tooltipText = tooltipGroup
			.append("text")
			.attr("fill", "white")
			.attr("font-size", "12px")
			.attr("font-family", "Inter")
			.attr("font-variant-numeric", "tabular-nums")
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
			const adjustedX = mouseX - margin.left;

			if (adjustedX < 0 || adjustedX > width) {
				crosshairGroup.style("opacity", 0);
				tooltipGroup.style("opacity", 0);
				return;
			}

			const x0 = xScale.invert(adjustedX);
			const i = Math.round(x0);
			const clampedIndex = Math.max(0, Math.min(data.history.length - 1, i));
			const d = data.history[clampedIndex];
			const x = xScale(clampedIndex);
			const y = yScale(d);

			crosshairGroup.style("opacity", 1);
			crosshairLine.attr("x1", x).attr("x2", x);
			crosshairCircle.attr("cx", x).attr("cy", y);

			const formattedValue = d.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
			tooltipText.text(formattedValue);
			tooltipTime.text(formatDateLabel(clampedIndex, true));

			const textBox = tooltipText.node()?.getBBox() ?? {
				width: 60,
				height: 16,
			};
			const timeBox = tooltipTime.node()?.getBBox() ?? {
				width: 60,
				height: 16,
			};
			const padding = 8;
			const rectWidth = Math.max(textBox.width, timeBox.width) + padding * 2;
			const rectHeight = textBox.height + timeBox.height + padding * 2;

			tooltipRect.attr("width", rectWidth).attr("height", rectHeight);

			let tooltipX: number;
			let tooltipY: number;

			if (isMobile) {
				tooltipX = x - rectWidth / 2;
				tooltipY = y - rectHeight - 12;
			} else {
				if (x > width / 2) {
					tooltipX = x - rectWidth - 12;
				} else {
					tooltipX = x + 12;
				}
				tooltipY = y - rectHeight / 2;
			}

			tooltipX = Math.max(0, Math.min(width - rectWidth, tooltipX));
			tooltipY = Math.max(0, Math.min(height - rectHeight, tooltipY));

			tooltipGroup.attr("transform", `translate(${tooltipX},${tooltipY})`);

			tooltipText.attr("x", rectWidth / 2).attr("y", rectHeight / 2 - 6);

			tooltipTime.attr("x", rectWidth / 2).attr("y", rectHeight / 2 + 10);

			tooltipGroup.style("opacity", 1);
		};

		const handlePointerLeave = () => {
			crosshairGroup.style("opacity", 0);
			tooltipGroup.style("opacity", 0);
		};

		overlay.on("pointermove", handlePointerMove);
		overlay.on("pointerleave", handlePointerLeave);
	}, [data, dimensions]);

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
