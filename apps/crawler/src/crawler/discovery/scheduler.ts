import { appLogger } from "@cvsa/logger";
import type { CrawlerQueue } from "../shared/types";
import type { SearchRoverConfig } from "./types";
import type { DiscoveryJobData } from "./worker";

/** Search sweeps are expensive; five minutes keeps the queue busy without thrash. */
export const DEFAULT_SEARCH_SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
/** Recommendation expansion of hot videos, paired with the sweep cadence. */
export const HOT_SAMPLE_INTERVAL_MS = 5 * 60 * 1_000;
/** Seeded videos per hot-sample round. */
export const DEFAULT_HOT_SAMPLE_LIMIT = 10;

export class DiscoveryScheduler {
	constructor(private readonly discoveryQueue: CrawlerQueue<DiscoveryJobData>) {}

	/**
	 * Register the repeatable discovery jobs.
	 *
	 * Two loops run side by side: the keyword search sweep discovers fresh
	 * uploads, and hot sampling expands the recommendation graph around the
	 * fastest-moving videos already in tracking.
	 */
	async startScheduledSweeps(
		intervalMs = DEFAULT_SEARCH_SWEEP_INTERVAL_MS,
		hotSampleIntervalMs = HOT_SAMPLE_INTERVAL_MS
	): Promise<void> {
		appLogger.info("Starting repeatable discovery jobs in BullMQ", {
			component: "discovery-scheduler",
			intervalMs,
			hotSampleIntervalMs,
		});

		await this.discoveryQueue.add(
			"repeatable-search-sweep",
			{ type: "search-sweep" },
			{
				jobId: "repeatable-search-sweep",
				repeat: {
					every: intervalMs,
				},
				removeOnComplete: { age: 3600, count: 100 },
			}
		);

		await this.discoveryQueue.add(
			"repeatable-hot-sample",
			{ type: "hot-sample", limit: DEFAULT_HOT_SAMPLE_LIMIT },
			{
				jobId: "repeatable-hot-sample",
				repeat: {
					every: hotSampleIntervalMs,
				},
				removeOnComplete: { age: 3600, count: 100 },
			}
		);
	}

	async triggerSearchSweep(config?: Partial<SearchRoverConfig>): Promise<void> {
		await this.discoveryQueue.add(
			`sweep-manual-${Date.now()}`,
			{ type: "search-sweep", config },
			{ removeOnComplete: { age: 3600, count: 100 } }
		);
	}

	async triggerHotSample(limit = DEFAULT_HOT_SAMPLE_LIMIT): Promise<void> {
		await this.discoveryQueue.add(
			`hot-sample-${Date.now()}`,
			{ type: "hot-sample", limit },
			{ removeOnComplete: { age: 3600, count: 100 } }
		);
	}

	async triggerDetailFetch(
		aid: bigint,
		source: "search" | "related" | "manual" = "manual"
	): Promise<void> {
		await this.discoveryQueue.add(
			`detail-${aid.toString()}`,
			{
				type: "fetch-video-details",
				aid: aid.toString(),
				source,
			},
			{
				deduplication: { id: `detail-${aid.toString()}` },
				removeOnComplete: { age: 3600, count: 100 },
			}
		);
	}

	async triggerActiveDiscovery(aid: bigint | string): Promise<void> {
		await this.discoveryQueue.add(
			`active-${aid.toString()}`,
			{
				type: "active-discovery",
				aid: aid.toString(),
			},
			{
				deduplication: { id: `active-${aid.toString()}` },
				removeOnComplete: { age: 3600, count: 100 },
			}
		);
	}
}
