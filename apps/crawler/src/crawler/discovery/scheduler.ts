import { appLogger } from "@cvsa/logger";
import type { CrawlerQueue } from "../shared/types";
import type { SearchRoverConfig } from "./types";
import type { DiscoveryJobData } from "./worker";

export class DiscoveryScheduler {
	constructor(private readonly discoveryQueue: CrawlerQueue<DiscoveryJobData>) {}

	async startScheduledSweeps(intervalMs = 300_000): Promise<void> {
		appLogger.info("Starting repeatable discovery search sweeps in BullMQ", {
			component: "discovery-scheduler",
			intervalMs,
		});

		await this.discoveryQueue.add(
			"repeatable-search-sweep",
			{ type: "search-sweep" },
			{
				jobId: "repeatable-search-sweep",
				repeat: {
					every: intervalMs,
				},
				removeOnComplete: true,
			}
		);
	}

	async triggerSearchSweep(config?: Partial<SearchRoverConfig>): Promise<void> {
		await this.discoveryQueue.add(
			`sweep-manual-${Date.now()}`,
			{ type: "search-sweep", config },
			{ removeOnComplete: true }
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
				jobId: `detail-${aid.toString()}`,
				removeOnComplete: true,
			}
		);
	}

	async triggerActiveDiscovery(aid: bigint): Promise<void> {
		await this.discoveryQueue.add(
			`active-${aid.toString()}`,
			{
				type: "active-discovery",
				aid: aid.toString(),
			},
			{
				jobId: `active-${aid.toString()}`,
				removeOnComplete: true,
			}
		);
	}
}
