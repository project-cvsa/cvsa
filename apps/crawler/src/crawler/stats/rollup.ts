import { asc, gte } from "drizzle-orm";
import { CrawlerMinuteMetricsSchema } from "@cvsa/contracts";
import { crawlerStatsMinute, toJson, type DatabaseClient, type Temporal } from "@cvsa/snapshot-db";
import type { StatsRollupMetrics } from "./types";

export interface SaveStatsRollupInput {
	sourceId: string;
	bucketTime: Temporal.Instant;
	metricGroup: string;
	metrics: StatsRollupMetrics;
}
export type StatsRollupRow = SaveStatsRollupInput;
export interface StatsRollupStore {
	saveRollup(input: SaveStatsRollupInput): Promise<void>;
	listRollup(
		metricGroup: string,
		since: Temporal.Instant,
		limit?: number
	): Promise<StatsRollupRow[]>;
}

export class CrawlerStatsRepository implements StatsRollupStore {
	constructor(private readonly db: DatabaseClient) {}
	async saveRollup(input: SaveStatsRollupInput): Promise<void> {
		const metrics = toJson(input.metrics);
		await this.db
			.insert(crawlerStatsMinute)
			.values({ sourceId: input.sourceId, bucketTime: input.bucketTime, metrics })
			.onConflictDoUpdate({
				target: [crawlerStatsMinute.bucketTime, crawlerStatsMinute.sourceId],
				set: { metrics },
			});
	}
	async listRollup(metricGroup: string, since: Temporal.Instant): Promise<StatsRollupRow[]> {
		const rows = await this.db
			.select()
			.from(crawlerStatsMinute)
			.where(gte(crawlerStatsMinute.bucketTime, since))
			.orderBy(asc(crawlerStatsMinute.bucketTime));
		return rows.map((row) => ({
			sourceId: row.sourceId,
			bucketTime: row.bucketTime,
			metricGroup,
			metrics: CrawlerMinuteMetricsSchema.parse(row.metrics),
		}));
	}
}
