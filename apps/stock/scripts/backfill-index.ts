/**
 * Backfill composite_index entries for the past week, one 10-minute slot at a time.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun run apps/stock/scripts/backfill-index.ts
 *
 * Or from the stock app directory:
 *   cd apps/stock
 *   DATABASE_URL=postgres://... bun run scripts/backfill-index.ts
 *
 * The script walks from oldest to newest so that each slot can reference the
 * previously-recorded value (just like the real-time scheduler does).
 */

import { computeAndRecordIndex } from "../lib/index-scheduler";

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes, matches scheduler
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function floorToInterval(ts: number): number {
	return Math.floor(ts / INTERVAL_MS) * INTERVAL_MS;
}

async function main() {
	const now = Date.now();
	const weekAgo = now - ONE_WEEK_MS;

	const startSlot = floorToInterval(weekAgo);
	const endSlot = floorToInterval(now);
	const slotCount = Math.floor((endSlot - startSlot) / INTERVAL_MS) + 1;

	console.log(
		`Backfilling ${slotCount} slots from ${new Date(startSlot).toISOString()} to ${new Date(endSlot).toISOString()}`,
	);

	let success = 0;
	let skipped = 0;
	let errors = 0;

	for (let i = 0; i < slotCount; i++) {
		const targetTime = startSlot + i * INTERVAL_MS;
		const timeStr = new Date(targetTime).toISOString();
		const label = `[${i + 1}/${slotCount}]`;

		try {
			const value = await computeAndRecordIndex(targetTime);
			if (value > 0) {
				console.log(`${label} ${timeStr} → ${value.toFixed(2)}`);
				success++;
			} else {
				console.log(`${label} ${timeStr} → skipped (no data / already recorded)`);
				skipped++;
			}
		} catch (err) {
			console.error(`${label} ${timeStr} → ERROR:`, err);
			errors++;
		}
	}

	console.log(`\nDone.  success=${success}  skipped=${skipped}  errors=${errors}`);
}

main().catch(console.error);
