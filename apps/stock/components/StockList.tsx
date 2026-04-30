"use client";

import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StockMiniChart } from "./StockMiniChart";
import {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
} from "@/components/ui/context-menu";
import { Copy, Trash2 } from "lucide-react";
import type { Stock } from "@/lib/stock-data";
import { copyToClipboard } from "@/lib/copy";
import { getChangeBg } from "@/lib/colors";
import { useColorMode } from "@/components/ColorModeContext";

interface StockListProps {
	stocks: Stock[];
	isAuthenticated: boolean;
	onDelete: (id: string) => void;
}

const formatPercentage = (value: number): string => {
	const abs = Math.abs(value);
	if (abs >= 10000) return `${(value / 1000).toFixed(1)}k`;
	if (abs >= 1000) return Math.round(value).toString();
	return abs >= 10 ? value.toFixed(1) : value.toFixed(2);
};

const StockItem = memo(
	({
		stock,
		isAuthenticated,
		onDelete,
	}: {
		stock: Stock;
		isAuthenticated: boolean;
		onDelete: (id: string) => void;
	}) => {
		const isPositive = stock.changePercent >= 0;
	const { mode } = useColorMode();

		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<a
						href={`/stock/${stock.id}`}
						className="flex items-center justify-between max-sm:mx-5 sm:px-5 py-4 hover:bg-white/2 transition-colors cursor-default"
					>
						<div className="flex-1 min-w-0">
							<div className="text-white font-semibold block truncate hover:underline w-fit">
								{stock.name}
							</div>
							<div className="text-muted-foreground text-sm font-mono block truncate w-fit">
								{stock.symbol}
							</div>
						</div>

						<div className="flex items-center">
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
									className={`font-[Inter] tabular-nums text-xs w-16 px-1 py-0.5 rounded-[3px] font-bold text-white ${getChangeBg(mode, stock.changePercent)}`}
								>
									{isPositive ? "+" : ""}
									{formatPercentage(stock.changePercent)}%
								</div>
							</div>
						</div>
					</a>
				</ContextMenuTrigger>

				{isAuthenticated && (
					<ContextMenuContent>
						<ContextMenuItem onClick={() => copyToClipboard(stock.symbol)}>
							<Copy className="size-4 mr-2" /> 复制BV号
						</ContextMenuItem>
						<ContextMenuItem variant="destructive" onClick={() => onDelete(stock.id)}>
							<Trash2 className="size-4 mr-2" /> 删除
						</ContextMenuItem>
					</ContextMenuContent>
				)}
			</ContextMenu>
		);
	}
);

StockItem.displayName = "StockItem";

export function StockList({ stocks, isAuthenticated, onDelete }: StockListProps) {
	return (
		<Card className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden py-0 max-sm:border-none ring-0">
			<CardContent className="p-0">
				<div className="divide-y divide-white/5">
					{stocks.map((stock) => (
						<StockItem
							key={stock.id}
							stock={stock}
							isAuthenticated={isAuthenticated}
							onDelete={onDelete}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
