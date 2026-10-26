"use client";

import { useEffect, useState } from "react";
import { Typewriter } from "./Typewriter";
import { t } from "@/lib/i18n";

export function Description() {
	const [lang, setLang] = useState("en");
	useEffect(() => {
		setLang(navigator.language.includes("zh") ? "zh" : "en");
	}, []);

	return (
		<Typewriter text={t("description", lang)} speed={lang === "zh" ? 35 : 60} delay={1700} />
	);
}
