"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface StockMiniChartProps {
	data: number[];
	change: number;
	width?: number;
	height?: number;
}

export function StockMiniChart({
	data,
	change,
	width = 100,
	height = 32,
}: StockMiniChartProps) {
	const svgRef = useRef<SVGSVGElement>(null);

	useEffect(() => {
		if (!svgRef.current || data.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const margin = { top: 2, right: 2, bottom: 2, left: 2 };
		const innerWidth = width - margin.left - margin.right;
		const innerHeight = height - margin.top - margin.bottom;

		const g = svg
			.append("g")
			.attr("transform", `translate(${margin.left},${margin.top})`);

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

		const strokeColor = change >= 0 ? "#22c55e" : "#ef4444";

		g.append("path")
			.datum(data)
			.attr("fill", "none")
			.attr("stroke", strokeColor)
			.attr("stroke-width", 1.5)
			.attr("stroke-linecap", "round")
			.attr("d", line);
	}, [data, change, width, height]);

	return (
		<svg
			ref={svgRef}
			width={width}
			height={height}
			className="inline-block"
		/>
	);
}
