"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { MarketIndex, Stock } from "@/lib/stock-data";
import { RANGE_LABELS, DEFAULT_RANGE } from "@/lib/stock-constants";
import { getChangeText } from "@/lib/colors";
import { useColorMode } from "@/components/ColorModeContext";
import { MarketIndexChart } from "@/components/MarketIndexChart";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BiliBili } from "@/components/BiliBili";

interface EtaInfo {
	speed: number;
	currentViews: number;
	updatedAt: string;
}

interface DetailData {
	stock: Stock;
	eta: EtaInfo;
	baseTime: string;
}

const RANGES = ["week", "2week", "month", "quarter"] as const;

export default function StockDetailPage() {
	const { aid } = useParams<{ aid: string }>();
	const [data, setData] = useState<DetailData | null>(null);
	const [loading, setLoading] = useState(true);
	const { mode } = useColorMode();
	const [error, setError] = useState<string | null>(null);
	const [range, setRange] = useState<string>(DEFAULT_RANGE);

	const fetchDetail = useCallback(() => {
		setLoading(true);
		fetch(`/api/stocks/${aid}?range=${range}`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((d: DetailData) => setData(d))
			.catch((err: Error) => {
				console.error("Failed to load detail:", err);
				setError(err.message);
			})
			.finally(() => setLoading(false));
	}, [aid, range]);

	useEffect(() => {
		fetchDetail();
	}, [fetchDetail]);

	if (error || (!data && !loading)) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-4">
				<div className="text-red-400 font-mono text-sm">{error ?? "没有数据"}</div>
				<Link
					href="/"
					className="text-muted-foreground hover:text-white transition-colors text-sm"
				>
					返回大盘
				</Link>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-4">
				<p>加载中……</p>
			</div>
		);
	}

	const { stock, eta } = data;
	const isPositive = stock.changePercent >= 0;
	const badgeColor = getChangeText(mode, stock.changePercent);

	const chartData: MarketIndex = {
		name: stock.name,
		value: stock.price,
		change: stock.change,
		changePercent: stock.changePercent,
		history: stock.sparkline,
		baseTime: data.baseTime,
	};

	return (
		<div className="min-h-screen">
			<div className="max-w-4xl mx-auto max-sm:px-0 px-4 py-6">
				<header className="mx-2 mb-6 flex items-center gap-4">
					<Link
						href="/"
						className="text-muted-foreground hover:text-white transition-colors"
					>
						<ArrowLeft className="size-5" />
					</Link>
					<div className="flex-1 min-w-0">
						<h1 className="text-xl font-bold text-white truncate">{stock.name}</h1>
						<div className="text-muted-foreground text-sm font-mono truncate">
							{stock.symbol}
						</div>
					</div>
				</header>
				<div className="mx-2 flex justify-between">
					<div className="flex flex-col gap-1 mb-6">
						<div className="flex gap-2 items-baseline">
							<div className="text-white font-[Inter] tabular-nums text-2xl font-semibold">
								{Math.round(stock.price).toLocaleString("en-US")}
							</div>
							<div
								className={`font-[Inter] tabular-nums text-sm ${badgeColor} w-fit h-fit px-2 py-0.5 rounded-[3px] font-bold`}
							>
								{isPositive ? "↑" : "↓"} {isPositive ? "+" : ""}
								{stock.changePercent.toFixed(2)}%
							</div>
						</div>
						<div className="text-muted-foreground text-sm font-mono">
							增速 {eta.speed.toFixed(2)} · {eta.currentViews.toLocaleString("en-US")}{" "}
							播放
						</div>
					</div>
					<Button size="icon-lg" variant="ghost">
						<Link href={`https://www.bilibili.com/video/${stock.symbol}`}>
							<BiliBili />
						</Link>
					</Button>
				</div>

				<div className="mx-2 mb-3 flex gap-1">
					{RANGES.map((r) => (
						<button
							key={r}
							type="button"
							onClick={() => setRange(r)}
							className={`px-3 py-1 text-xs rounded-md transition-colors ${
								r === range
									? "bg-white/10 text-white"
									: "text-muted-foreground hover:text-white hover:bg-white/5"
							}`}
						>
							{RANGE_LABELS[r]}
						</button>
					))}
				</div>

				<div className="aspect-2/1 w-full overflow-hidden">
					<MarketIndexChart data={chartData} />
				</div>
			</div>
		</div>
	);
}
