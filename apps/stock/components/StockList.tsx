"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StockMiniChart } from "./StockMiniChart";
import type { Stock } from "@/lib/stock-data";

interface StockListProps {
	stocks: Stock[];
}

function formatPercentage(value: number): string {
	const absValue = Math.abs(value);

	if (absValue >= 10000) {
		return `${(value / 1000).toFixed(1)}k`;
	}

	if (absValue >= 1000) {
		return Math.round(value).toString();
	}

	if (absValue >= 10) {
		return value.toFixed(1);
	}

	return value.toFixed(2);
}

export function StockList({ stocks }: StockListProps) {
	return (
		<Card className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden py-0 max-sm:border-none">
			<CardContent className="p-0">
				<div className="divide-y divide-white/5">
					{stocks.map((stock) => {
						const isPositive = stock.changePercent >= 0;
						const changeColor = isPositive ? "bg-green-600" : "bg-red-500";

						return (
							<div
								key={stock.id}
								className="flex items-center justify-between max-sm:mx-5 px-5 py-4 hover:bg-white/2 transition-colors"
							>
								<div className="flex-1 min-w-0">
									<div className="text-white font-semibold truncate">
										{stock.name}
									</div>
									<div className="text-neutral-500 text-sm font-mono">
										{stock.symbol}
									</div>
								</div>

								<div className="shrink-0 mx-2 sm:hidden">
									<StockMiniChart
										data={stock.sparkline}
										change={stock.changePercent}
									/>
								</div>
								<div className="shrink-0 mx-6 max-sm:hidden">
									<StockMiniChart
										data={stock.sparkline}
										change={stock.changePercent}
										width={120}
									/>
								</div>

								<div className="shrink-0 text-right min-w-16 flex flex-col items-end md:ml-5 gap-1">
									<div className="text-white font-[Inter] tabular-nums font-semibold">
										{Math.round(stock.price).toLocaleString("en-US")}
									</div>
									<div
										className={`font-[Inter] tabular-nums text-xs ${changeColor} w-16 px-1 py-0.5 rounded-[3px] font-bold text-white`}
									>
										{isPositive ? "+" : ""}
										{formatPercentage(stock.changePercent)}%
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
