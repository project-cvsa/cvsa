"use client";

import { useEffect, useState } from "react";

interface TypewriterProps {
	text: string;
	speed?: number;
	delay?: number;
}

export function Typewriter({ text, speed = 50, delay = 500 }: TypewriterProps) {
	const [visibleCount, setVisibleCount] = useState(0);
	const [startTyping, setStartTyping] = useState(false);

	useEffect(() => {
		const delayTimer = setTimeout(() => {
			setStartTyping(true);
		}, delay);

		return () => clearTimeout(delayTimer);
	}, [delay]);

	useEffect(() => {
		if (!startTyping) return;

		const interval = setInterval(() => {
			setVisibleCount((prev) => {
				if (prev < text.length) {
					return prev + 1;
				}
				clearInterval(interval);
				return prev;
			});
		}, 1000 / speed);

		return () => clearInterval(interval);
	}, [text, speed, startTyping]);

	return (
		<span>
			{text.split("").map((char, index) => (
				<span
					key={index}
					style={{
						opacity: index < visibleCount ? 1 : 0,
						display: "inline",
					}}
				>
					{char}
				</span>
			))}
		</span>
	);
}
