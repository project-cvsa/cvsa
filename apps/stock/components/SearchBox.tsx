"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Stock } from "@/lib/stock-data";
import { StockList } from "./StockList";
import { Search } from "lucide-react";

interface SearchBoxProps {
	isAuthenticated: boolean;
	onDelete: (id: string) => void;
	children: ReactNode;
}

export function SearchBox({ isAuthenticated, onDelete, children }: SearchBoxProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Stock[]>([]);
	const [searching, setSearching] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(null);

	const fetchSearch = useCallback((q: string) => {
		setSearching(true);
		fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: { stocks: Stock[] }) => setResults(data.stocks))
			.catch((err: Error) => {
				console.error("Search failed:", err);
				setResults([]);
			})
			.finally(() => setSearching(false));
	}, []);

	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		const trimmed = query.trim();
		if (!trimmed) {
			setResults([]);
			setSearching(false);
			return;
		}
		timer.current = setTimeout(() => fetchSearch(trimmed), 300);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [query, fetchSearch]);

	const active = query.trim().length > 0;

	return (
		<div className="flex flex-col gap-6 mt-4 px-2">
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500 pointer-events-none" />
				<input
					type="text"
					className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/10 transition-colors"
					placeholder="搜索 BV 号 / AID / 曲名…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>

			{active ? (
				<>
					{searching && (
						<div className="rounded-2xl bg-[#0a0a0a] border border-white/5 p-8 text-center">
							<div className="text-zinc-500 font-mono text-sm">
								搜索中...
							</div>
						</div>
					)}
					{!searching && results.length > 0 && (
						<StockList
							stocks={results}
							isAuthenticated={isAuthenticated}
							onDelete={onDelete}
						/>
					)}
					{!searching && results.length === 0 && (
						<div className="rounded-2xl bg-[#0a0a0a] border border-white/5 p-8 text-center">
							<div className="text-zinc-500 font-mono text-sm">
								无结果
							</div>
						</div>
					)}
				</>
			) : (
				children
			)}
		</div>
	);
}
