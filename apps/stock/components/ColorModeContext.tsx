"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { ColorMode } from "@/lib/colors";

const STORAGE_KEY = "cvsa_color_mode";

interface ColorModeContextValue {
	mode: ColorMode;
	toggle: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue>({
	mode: "red-up",
	toggle: () => {},
});

export function ColorModeProvider({ children }: { children: ReactNode }) {
	const [mode, setMode] = useState<ColorMode>("red-up");

	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
		if (stored === "red-up" || stored === "green-up") {
			setMode(stored);
		}
	}, []);

	const toggle = useCallback(() => {
		setMode((prev) => {
			const next = prev === "red-up" ? "green-up" : "red-up";
			localStorage.setItem(STORAGE_KEY, next);
			return next;
		});
	}, []);

	return (
		<ColorModeContext.Provider value={{ mode, toggle }}>{children}</ColorModeContext.Provider>
	);
}

export function useColorMode(): ColorModeContextValue {
	return useContext(ColorModeContext);
}
