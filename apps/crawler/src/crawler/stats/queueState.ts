import type { CrawlerQueueName } from "@cvsa/contracts";
import type { CrawlerQueue } from "../shared/types";
import type { StatsQueueSnapshot } from "./types";

export async function readQueueSnapshot(queue: CrawlerQueue<unknown>): Promise<StatsQueueSnapshot> {
	const counts = await queue.getJobCounts();
	const [waiting, prioritized, active] = await Promise.all([
		counts.waiting > 0 ? queue.getJobs(["waiting"], 1, 0) : Promise.resolve([]),
		counts.prioritized && counts.prioritized > 0
			? queue.getJobs(["prioritized"], 1, 0)
			: Promise.resolve([]),
		counts.active > 0 ? queue.getJobs(["active"], 1, 0) : Promise.resolve([]),
	]);
	const waitingJobs = [...waiting, ...prioritized];
	const oldest = waitingJobs.sort(
		(a, b) => (a.readyAt ?? a.timestamp) - (b.readyAt ?? b.timestamp)
	)[0];
	const activeJob = active[0];
	const now = Date.now();
	return {
		waiting: counts.waiting,
		prioritized: counts.prioritized ?? prioritized.length,
		active: counts.active,
		delayed: counts.delayed,
		failed: counts.failed,
		completed: counts.completed,
		oldestWaitSec: oldest
			? Math.max(0, (now - (oldest.readyAt ?? oldest.timestamp)) / 1000)
			: 0,
		activeAgeSec: activeJob
			? Math.max(0, (now - (activeJob.processedOn ?? activeJob.timestamp)) / 1000)
			: 0,
	};
}

export async function readQueues(
	queues: Record<CrawlerQueueName, CrawlerQueue<unknown>> & { milestones?: CrawlerQueue<unknown> }
): Promise<Record<string, StatsQueueSnapshot>> {
	const [tracking, discovery] = await Promise.all([
		readQueueSnapshot(queues.tracking),
		readQueueSnapshot(queues.discovery),
	]);
	return {
		tracking,
		discovery,
		...(queues.milestones ? { milestones: await readQueueSnapshot(queues.milestones) } : {}),
	};
}
