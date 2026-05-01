import { getSql } from "./db";
import { computeMarketIndex } from "./stock-compute";

const INDEX_SNAP_MS = 10 * 60 * 1000;

export async function computeAndRecordIndex(targetTime = Date.now()): Promise<number> {
	const sql = getSql();
	const now = new Date(targetTime);
	const snapped = new Date(Math.floor(now.getTime() / INDEX_SNAP_MS) * INDEX_SNAP_MS);
	const value = await computeMarketIndex(snapped);
	await sql`
		INSERT INTO internal.composite_index (time, value)
		VALUES (${snapped}, ${value})
		ON CONFLICT (time) DO NOTHING
	`;
	return value;
}

const JOB_INTERVAL_MS = 1 * 60 * 1000;

export function startIndexScheduler(): void {
	const run = async () => {
		try {
			const value = await computeAndRecordIndex();
			if (value > 0) {
				console.log(`[index-scheduler] recorded index=${value.toFixed(2)}`);
			}
		} catch (err) {
			console.error("[index-scheduler] failed:", err);
		}
	};

	run();
	setInterval(run, JOB_INTERVAL_MS);
	console.log(`[index-scheduler] started, interval=${JOB_INTERVAL_MS / 1000}s`);
}
