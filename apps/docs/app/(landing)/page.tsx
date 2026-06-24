"use client";

import { HeroLinks } from "@/components/Links";
import { LogoEnglish } from "@/components/icon/LogoEnglish";
import { DigitGrid } from "./DigitGrid";
import { Description } from "./Description";
import "./global.css";
import { useEffect } from "react";
import { t } from "@/lib/i18n";

const titleWords = ["Archive", "for", "a", "Better", "Future"];

export default function Page() {
	useEffect(() => {
		const lang = navigator.language.includes("zh") ? "zh" : "en";
		document.title = t("title", lang);
	}, []);

	return (
		<>
			<div className="relative max-lg:w-full xl:left-[min(3vw,12rem)] px-6 md:px-16 z-10 dark:text-white">
				<div className="max-w-3xl text-left">
					<div className="mb-4 md:mb-8 flex justify-start">
						<div className="origin-left opacity-0 animate-fade-in delay-1000">
							<LogoEnglish className="h-6 sm:h-8 md:h-9 w-auto translate-x-1" />
						</div>
					</div>

					<h1 className="text-5xl sm:text-6xl lg:text-7xl font-extralight tracking-tight mb-6 leading-[1.1]">
						{titleWords.map((word, index) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fine for this case
								key={index}
								className="inline-block mr-[0.25em] animate-blur-in"
								style={{ animationDelay: `${1200 + index * 100}ms` }}
							>
								{word}
							</span>
						))}
					</h1>

					<p
						className="text-black/70 dark:text-white/60 text-lg
                            lg:text-xl mb-10 leading-relaxed max-w-2xl"
					>
						<Description />
					</p>

					<HeroLinks />
				</div>
			</div>
			<DigitGrid />
		</>
	);
}
