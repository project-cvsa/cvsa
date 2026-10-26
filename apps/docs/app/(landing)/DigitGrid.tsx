"use client";

import { useEffect, useRef, useState } from "react";

export const DigitGrid = () => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [isLargeScreen, setIsLargeScreen] = useState<boolean>(true);
	const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

	const cellWidth = 8;
	const cellHeight = 13;
	const MOBILE_THRESHOLD = 768;
	const introDuration = 2000;
	const ignitionDuration = 360;

	const introStartTimeRef = useRef<number | null>(null);

	useEffect(() => {
		const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const checkTheme = () => {
			setIsDarkMode(themeQuery.matches);
		};

		checkTheme();
		themeQuery.addEventListener("change", checkTheme);

		const checkScreenSize = () => {
			setIsLargeScreen(window.innerWidth >= MOBILE_THRESHOLD);
		};

		checkScreenSize();
		window.addEventListener("resize", checkScreenSize);

		if (!isLargeScreen) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let animationFrameId: number;
		let lastGridTick = 0;
		let lastMouseTick = 0;
		const gridFps = 12;
		const gridInterval = 1000 / gridFps;
		const mouseFps = 30;
		const mouseInterval = 1000 / mouseFps;

		let charMatrix: string[][] = [];
		let cols = 0;
		let rows = 0;

		let cachedGridOpacities = new Map<string, number>();
		let isFirstMove = true;
		const mousePos = { x: 0, y: 0 };
		const lastMousePos = { x: 0, y: 0 };
		const mouseCellOpacities = new Map<string, number>();
		const mouseBrushRadius = 4;
		const idleOpacity = isDarkMode ? 0.04 : 0.02;
		const scaleFactor = cellHeight / cellWidth;

		const generateChar = () => Math.floor(Math.random() * 16).toString(16);

		const updateGridLogic = (time: number) => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const A = Math.min(width * 0.3, height * 0.4);
			const cx = width - A - width * 0.05;
			const cy = height / 2;
			const timeSec = time / 1000;
			const speedScale = 1.35;
			const t_light = (timeSec * speedScale) % (2 * Math.PI);

			const newGridOpacities = new Map<string, number>();
			const pathSteps = 100;
			const brushRadius = Math.round(Math.min(Math.max(width / 400, 1), 4));

			for (let i = 0; i < pathSteps; i++) {
				const t = (i / pathSteps) * 2 * Math.PI;
				const denominator = 1 + Math.sin(t) ** 2;
				const x = cx + (A * Math.cos(t)) / denominator;
				const y = cy + (A * Math.cos(t) * Math.sin(t)) / denominator;
				const centerCol = Math.floor(x / cellWidth);
				const centerRow = Math.floor(y / cellHeight);

				let diff = t_light - t;
				if (diff < 0) diff += 2 * Math.PI;
				const tailLength = Math.PI * 1.2;
				const glow = Math.max(0, 1 - diff / tailLength);
				const baseOpacity = 0.12 + 0.8 * glow ** 3;
				for (
					let dc = -Math.round(brushRadius * scaleFactor);
					dc <= Math.round(brushRadius * scaleFactor);
					dc++
				) {
					for (let dr = -brushRadius; dr <= brushRadius; dr++) {
						const distSq = dc * dc + dr * dr;
						if (distSq > brushRadius * brushRadius) continue;
						const nc = centerCol + dc;
						const nr = centerRow + dr;
						if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
						const key = `${nc},${nr}`;
						const falloff = 1 - Math.sqrt(distSq) / (brushRadius + 1);
						const finalOpacity = baseOpacity * falloff;
						newGridOpacities.set(
							key,
							Math.max(newGridOpacities.get(key) || 0, finalOpacity)
						);
					}
				}
			}
			cachedGridOpacities = newGridOpacities;

			for (let c = 0; c < cols; c++) {
				for (let r = 0; r < rows; r++) {
					const key = `${c},${r}`;
					const op = cachedGridOpacities.get(key) || 0.02;
					const mutationProbability = 0.05 + op * 0.5;
					if (Math.random() < mutationProbability) {
						if (charMatrix[c]) charMatrix[c][r] = generateChar();
					}
				}
			}
		};

		const drawFrame = (currentTime: number) => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			ctx.clearRect(0, 0, width, height);

			ctx.font = `600 ${cellHeight * 0.8}px 'Funnel Sans'`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";

			const colorBase = isDarkMode ? "255, 255, 255" : "0, 0, 0";

			if (introStartTimeRef.current === null) introStartTimeRef.current = currentTime;
			const elapsed = currentTime - introStartTimeRef.current;
			const isIntroDone = elapsed > introDuration;

			const centerX = width / 2;
			const centerY = height / 2;
			const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY) + 300;

			let currentR = 0,
				peakBrightness = 0,
				waveFrontWidth = 0,
				waveBackWidth = 0;

			if (!isIntroDone) {
				if (elapsed < ignitionDuration) {
					const p = elapsed / ignitionDuration;
					currentR = 40 * p;
					peakBrightness = p;
					waveFrontWidth = 40;
					waveBackWidth = 40;
				} else {
					const p = (elapsed - ignitionDuration) / (introDuration - ignitionDuration);
					const easedP = 1 - (1 - p) ** 4;
					currentR = 40 + easedP * maxRadius;
					peakBrightness = 1.0;
					waveFrontWidth = 40 + easedP * 80;
					waveBackWidth = 40 + easedP * 150;
				}
			}

			for (let c = 0; c < cols; c++) {
				if (!charMatrix[c]) continue;
				for (let r = 0; r < rows; r++) {
					const xPos = c * cellWidth + cellWidth / 2;
					const yPos = r * cellHeight + cellHeight / 2;

					const gridOp = cachedGridOpacities.get(`${c},${r}`) || idleOpacity;
					const mouseOp = mouseCellOpacities.get(`${c},${r}`) || 0;
					const baseLogicOpacity = Math.max(gridOp, mouseOp, idleOpacity);

					let finalOpacity = baseLogicOpacity;

					if (!isIntroDone) {
						const dx = xPos - centerX;
						const dy = yPos - centerY;
						const distToCenter = Math.sqrt(dx * dx + dy * dy);
						const distToPeak = distToCenter - currentR;

						let waveIntensity = 0;
						if (distToPeak > 0) {
							const normalized = distToPeak / waveFrontWidth;
							waveIntensity = peakBrightness * Math.exp(-normalized * normalized * 4);
							finalOpacity = waveIntensity;
						} else {
							const normalized = Math.abs(distToPeak) / waveBackWidth;
							waveIntensity = peakBrightness * Math.exp(-normalized * normalized * 3);
							finalOpacity = Math.max(baseLogicOpacity, waveIntensity);
						}
						if (elapsed < ignitionDuration) finalOpacity *= elapsed / ignitionDuration;
					}

					if (finalOpacity <= idleOpacity) continue;

					ctx.fillStyle = `rgba(${colorBase}, ${finalOpacity})`;
					ctx.fillText(charMatrix[c][r], xPos, yPos);
				}
			}
		};

		const render = (time: number) => {
			const elapsed = time - (introStartTimeRef.current ?? time);
			const isIntroDone = elapsed > introDuration;
			let shouldDraw = !isIntroDone;

			if (time - lastGridTick >= gridInterval) {
				updateGridLogic(time);
				lastGridTick = time;
				shouldDraw = true;
			}

			if (time - lastMouseTick >= mouseInterval) {
				lastMouseTick = time;
				shouldDraw = true;
				const dx = mousePos.x - lastMousePos.x;
				const dy = mousePos.y - lastMousePos.y;
				const distance = Math.sqrt(dx * dx + dy * dy);

				mouseCellOpacities.forEach((val, key) => {
					const newVal = val * 0.85;
					if (newVal < 0.01) mouseCellOpacities.delete(key);
					else mouseCellOpacities.set(key, newVal);
				});

				if (distance > 0.5 && !isFirstMove && distance < 300) {
					const steps = Math.max(1, Math.ceil(distance / (cellWidth / 2)));
					const speedBrightness = Math.min(distance / 15, 0.7);
					for (let s = 0; s <= steps; s++) {
						const lerpX = lastMousePos.x + dx * (s / steps);
						const lerpY = lastMousePos.y + dy * (s / steps);
						const mCol = Math.floor(lerpX / cellWidth);
						const mRow = Math.floor(lerpY / cellHeight);
						for (
							let dc = -Math.round(mouseBrushRadius * scaleFactor);
							dc <= Math.round(mouseBrushRadius * scaleFactor);
							dc++
						) {
							for (let dr = -mouseBrushRadius; dr <= mouseBrushRadius; dr++) {
								const distSq = (dc * dc) / scaleFactor / scaleFactor + dr * dr;
								if (distSq <= mouseBrushRadius * mouseBrushRadius) {
									const nc = mCol + dc;
									const nr = mRow + dr;
									if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
										const key = `${nc},${nr}`;
										const falloff = 1 - distSq ** 0.6 / (mouseBrushRadius + 1);
										mouseCellOpacities.set(
											key,
											Math.max(
												mouseCellOpacities.get(key) || 0,
												speedBrightness * falloff
											)
										);
									}
								}
							}
						}
					}
				}
				lastMousePos.x = mousePos.x;
				lastMousePos.y = mousePos.y;
				if (isFirstMove) isFirstMove = false;
			}

			if (shouldDraw) drawFrame(time);
			animationFrameId = requestAnimationFrame(render);
		};

		const handleResize = () => {
			const dpr = window.devicePixelRatio || 1;
			const width = window.innerWidth;
			const height = window.innerHeight;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			const newCols = Math.ceil(width / cellWidth);
			const newRows = Math.ceil(height / cellHeight);
			const newMatrix: string[][] = [];
			for (let c = 0; c < newCols; c++) {
				newMatrix[c] = [];
				for (let r = 0; r < newRows; r++) {
					newMatrix[c][r] = charMatrix[c]?.[r] ? charMatrix[c][r] : generateChar();
				}
			}
			cols = newCols;
			rows = newRows;
			charMatrix = newMatrix;
			updateGridLogic(performance.now());
			drawFrame(performance.now());
		};

		const handleMouseMove = (e: MouseEvent) => {
			mousePos.x = e.clientX;
			mousePos.y = e.clientY;
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("resize", handleResize);
		handleResize();
		animationFrameId = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationFrameId);
			themeQuery.removeEventListener("change", checkTheme);
			window.removeEventListener("resize", handleResize);
			window.removeEventListener("resize", checkScreenSize);
			window.removeEventListener("mousemove", handleMouseMove);
		};
	}, [isLargeScreen, isDarkMode]);

	if (!isLargeScreen) return null;

	return (
		<div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
			<canvas ref={canvasRef} />
		</div>
	);
};
