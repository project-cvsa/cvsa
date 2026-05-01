"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { getChangeColor } from "@/lib/colors";
import { useColorMode } from "@/components/ColorModeContext";

interface StockMiniChartProps {
	data: number[];
	change: number;
	width?: number;
	height?: number;
}

export function StockMiniChart({ data, change, width = 100, height = 32 }: StockMiniChartProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const { mode } = useColorMode();

	useEffect(() => {
		if (!svgRef.current || data.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const margin = { top: 2, right: 2, bottom: 2, left: 2 };
		const innerWidth = width - margin.left - margin.right;
		const innerHeight = height - margin.top - margin.bottom;

		const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

		const xScale = d3
			.scaleLinear()
			.domain([0, data.length - 1])
			.range([0, innerWidth]);

		const yMin = d3.min(data) ?? 0;
		const yMax = d3.max(data) ?? 100;
		const yPadding = (yMax - yMin) * 0.1 || 1;

		const yScale = d3
			.scaleLinear()
			.domain([yMin - yPadding, yMax + yPadding])
			.range([innerHeight, 0]);

		const line = d3
			.line<number>()
			.x((_, i) => xScale(i))
			.y((d) => yScale(d))
			.curve(d3.curveBasis);

		const area = d3
			.area<number>()
			.x((_, i) => xScale(i))
			.y0(innerHeight)
			.y1((d) => yScale(d))
			.curve(d3.curveBasis);

		const strokeColor = getChangeColor(mode, change);

		const gradientId = `mini-${Math.random().toString(36).slice(2, 8)}`;
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
			.attr("stop-color", strokeColor)
			.attr("stop-opacity", 0.25);

		gradient
			.append("stop")
			.attr("offset", "100%")
			.attr("stop-color", strokeColor)
			.attr("stop-opacity", 0);

		g.append("path").datum(data).attr("fill", `url(#${gradientId})`).attr("d", area);

		g.append("path")
			.datum(data)
			.attr("fill", "none")
			.attr("stroke", strokeColor)
			.attr("stroke-width", 1.5)
			.attr("stroke-linecap", "round")
			.attr("d", line);
	}, [data, change, width, height, mode]);

	return <svg ref={svgRef} width={width} height={height} className="inline-block" />;
}
