"use client";

import type { MarketIndex } from "@/lib/stock-data";
import { getChangeText } from "@/lib/colors";
import { useColorMode } from "@/components/ColorModeContext";
import { MarketIndexChart } from "@/components/MarketIndexChart";

interface MarketIndexCardProps {
	marketIndex: MarketIndex | null;
	loading: boolean;
}

export function MarketIndexCard({ marketIndex, loading }: MarketIndexCardProps) {
	const { mode } = useColorMode();

	return (
		<div className="rounded-2xl bg-[#0a0a0a] overflow-hidden">
			{loading && !marketIndex && (
				<div className="">
					<div className="mx-2 h-28 bg-white/5 rounded-lg animate-pulse" />
					<div className="mx-2 h-74 sm:h-96 bg-white/5 rounded-lg mt-2 animate-pulse" />
				</div>
			)}

			{marketIndex && (
				<>
					<div className="px-2 py-5">
						<div className="flex items-end justify-between mt-1">
							<div className="flex flex-col">
								<div className="text-lg">
									{marketIndex.name}
								</div>
								<div className="text-3xl sm:text-4xl font-[Google_Sans] tabular-nums text-white">
									{marketIndex.value.toLocaleString("en-US", {
										minimumFractionDigits: 0,
										maximumFractionDigits: 2,
									})}
								</div>
							</div>
							<div className="text-right">
								<div
									className={`text-lg font-[Inter] tabular-nums font-semibold ${getChangeText(mode, marketIndex.change)}`}
								>
									{marketIndex.change >= 0 ? "↑" : "↓"}{" "}
									{marketIndex.change >= 0 ? "+" : ""}
									{marketIndex.changePercent.toFixed(2)}%
								</div>
								<div
									className={`text-sm font-[Inter] tabular-nums ${getChangeText(mode, marketIndex.change)} opacity-80`}
								>
									{marketIndex.change >= 0 ? "+" : ""}
									{marketIndex.change.toFixed(2)}
								</div>
							</div>
						</div>
					</div>
					<div className="absolute mx-2 text-muted-foreground text-sm flex gap-4">
						<span>开盘: {marketIndex.openValue?.toFixed(2) ?? "N/A"}</span>
						<span>最高: {marketIndex.highValue?.toFixed(2) ?? "N/A"}</span>
						<span>最低: {marketIndex.lowValue?.toFixed(2) ?? "N/A"}</span>
					</div>
					<div className="h-80 sm:h-100 -translate-y-2">
						<MarketIndexChart data={marketIndex} isIndex={true} />
					</div>
				</>
			)}
		</div>
	);
}
