const LOG10 = Math.log(10);
function log10(value: number): number {
	return Math.log(value) / LOG10;
}

function log(value: number, base: number): number {
	return Math.log(value) / Math.log(base);
}

/**
 * Returns the non-linear adjustment factor for milestone ETA calculation.
 *
 * Slower videos far from the target take a larger factor to prevent premature
 * polling storms; as the target draws closer, the factor approaches 4.5.
 */
export function getMilestoneEtaFactor(viewsToIncrease: number): number {
	const a = 1.054;
	const b = 4.5;
	const c = 100;
	const u = 0.601;
	const g = 455;

	let factor: number;
	if (viewsToIncrease > g) {
		factor = log(b / log10(viewsToIncrease + 1), a);
	} else {
		factor = log(b / log10(viewsToIncrease + c), a) + u;
	}

	if (factor < 4.5) return 4.5;
	if (factor > 100) return 100;
	return factor;
}

/**
 * Returns the closest milestone threshold for the given view count.
 *
 * 100,000 (殿堂) -> 1,000,000 (传说) -> 10,000,000 (神话)
 */
export function getClosetMilestone(views: number, strict = false): number {
	if (views < 100_000) return 100_000;
	if (views < 1_000_000) return 1_000_000;
	if (views < 10_000_000) {
		return strict ? 10_000_000 : Math.ceil(views / 1_000_000) * 1_000_000;
	}
	return Math.ceil(views / 1_000_000) * 1_000_000;
}
