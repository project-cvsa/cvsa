"use client";

import { useEffect } from "react";

export function UpdateLanguage() {
	useEffect(() => {
		const lang = navigator.language.includes("zh") ? "zh" : "en";
		document.documentElement.lang = lang;
	}, []);
	return <></>;
}
