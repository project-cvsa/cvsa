"use client";

import { useEffect, useState } from "react";
import { generateMarketIndex, type Stock } from "@/lib/stock-data";
import { MarketIndexChart } from "@/components/MarketIndexChart";
import { StockList } from "@/components/StockList";

export default function Home() {
	const marketIndex = generateMarketIndex();
	const [stocks, setStocks] = useState<Stock[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/stocks")
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data) => {
				setStocks(data.stocks);
			})
			.catch((err: Error) => {
				console.error("Failed to load stocks:", err);
				setError(err.message);
			})
			.finally(() => {
				setLoading(false);
			});
	}, []);

	return (
		<div className="min-h-screen">
			<div className="max-w-4xl mx-auto max-sm:px-0 px-4 py-6">
				<header className="mb-6">
					<h1 className="text-3xl font-bold tracking-wide">
						中V大盘
					</h1>
				</header>

				<div className="flex flex-col gap-6">
					<div className="rounded-2xl bg-[#0a0a0a] overflow-hidden">
						<div className="px-6 py-5">
							<div className="text-sm text-zinc-400 font-medium">
								{marketIndex.name}
							</div>
							<div className="flex items-baseline justify-between mt-1">
								<div className="text-3xl sm:text-4xl font-mono font-semibold text-white">
									{marketIndex.value.toLocaleString("en-US", {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2,
									})}
								</div>
								<div className="text-right">
									<div
										className={`text-lg font-mono font-semibold ${
											marketIndex.change >= 0
												? "text-green-500"
												: "text-red-500"
										}`}
									>
										{marketIndex.change >= 0 ? "↑" : "↓"}{" "}
										{marketIndex.change >= 0 ? "+" : ""}
										{marketIndex.changePercent.toFixed(2)}%
									</div>
									<div
										className={`text-sm font-mono ${
											marketIndex.change >= 0
												? "text-green-500"
												: "text-red-500"
										} opacity-80`}
									>
										{marketIndex.change >= 0 ? "+" : ""}
										{marketIndex.change.toFixed(2)}
									</div>
								</div>
							</div>
						</div>
						<div className="h-80 sm:h-100">
							<MarketIndexChart data={marketIndex} />
						</div>
					</div>

					{loading && (
						<div className="rounded-2xl bg-[#0a0a0a] border border-white/5 p-8 text-center">
							<div className="text-zinc-500 font-mono text-sm">
								Loading market data...
							</div>
						</div>
					)}

					{error && (
						<div className="rounded-2xl bg-[#0a0a0a] border border-red-500/20 p-8 text-center">
							<div className="text-red-400 font-mono text-sm">
								Failed to load: {error}
							</div>
						</div>
					)}

					{!loading && !error && stocks.length > 0 && (
						<StockList stocks={stocks} />
					)}

					{!loading && !error && stocks.length === 0 && (
						<div className="rounded-2xl bg-[#0a0a0a] border border-white/5 p-8 text-center">
							<div className="text-zinc-500 font-mono text-sm">
								No stock data available.
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
