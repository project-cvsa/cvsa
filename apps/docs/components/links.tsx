"use client";

import { useEffect, useState } from "react";

export function HeroLinks() {
	const [lang, setLang] = useState("en");

	useEffect(() => {
		setLang(navigator.language.includes("zh") ? "zh" : "en");
	}, []);

	return (
		<div className="flex sm:flex-row items-stretch sm:items-center w-full sm:w-auto gap-4">
			<a
				href={`/${lang}`}
				className="inline-flex items-center justify-center sm:px-8 sm:py-3.5 border-black dark:border-white
                font-semibold rounded-full border bg-transparent text-black/70 box-border 
                hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black dark:text-white/70
                transition-colors duration-300 px-6 py-3 text-sm sm:text-base
                opacity-0 animate-blur-in [animation-delay:1700ms]!"
			>
				{lang === "zh" ? "阅读文档" : "Read Docs"}
			</a>
			<a
				href="https://projectcvsa.com"
				className="inline-flex items-center justify-center px-6 py-3 sm:px-8 sm:py-4 font-medium rounded-full
                bg-black text-white dark:bg-white dark:text-black
                hover:bg-black/80 hover:dark:bg-white/80 transition-colors duration-300 text-sm sm:text-base
                opacity-0 animate-blur-in [animation-delay:2000ms]!"
			>
				{lang === "zh" ? "访问网站" : "Visit Website"}
			</a>
		</div>
	);
}
