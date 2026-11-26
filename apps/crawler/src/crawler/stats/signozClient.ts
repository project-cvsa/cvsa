import type { CrawlerStatsRollupPoint } from "@cvsa/contracts";

export interface PromQueryPoint {
	time: number; // Unix timestamp in seconds
	value: number | null;
}

export interface PromQueryResult {
	metric: Record<string, string>;
	values: Array<[number, string]>;
}

export interface SigNozClientOptions {
	endpoint?: string;
	apiKey?: string;
	timeoutMs?: number;
}

export function pickSigNozStep(durationMinutes: number): number {
	if (durationMinutes <= 5) return 5;
	if (durationMinutes <= 15) return 15;
	if (durationMinutes <= 30) return 30;
	if (durationMinutes <= 60) return 60;
	if (durationMinutes <= 360) return 120;
	if (durationMinutes <= 1440) return 300;
	return 1800;
}

export class SigNozMetricsClient {
	private readonly endpoint: string | undefined;
	private readonly apiKey: string | undefined;
	private readonly timeoutMs: number;

	constructor(options: SigNozClientOptions = {}) {
		this.endpoint = options.endpoint?.trim()?.replace(/\/+$/, "");
		this.apiKey = options.apiKey?.trim();
		this.timeoutMs = options.timeoutMs ?? 5000;
	}

	get isConfigured(): boolean {
		return Boolean(this.endpoint);
	}

	async queryRange(
		query: string,
		startSec: number,
		endSec: number,
		stepSec: number
	): Promise<PromQueryResult[]> {
		if (!this.endpoint) return [];

		const url = new URL(`${this.endpoint}/api/v1/query_range`);
		url.searchParams.set("query", query);
		url.searchParams.set("start", String(startSec));
		url.searchParams.set("end", String(endSec));
		url.searchParams.set("step", `${stepSec}s`);

		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (this.apiKey) {
			headers["SIGNOZ-API-KEY"] = this.apiKey;
		}

		const response = await fetch(url.toString(), {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(this.timeoutMs),
		});

		if (!response.ok) {
			throw new Error(`SigNoz query_range failed: ${response.status} ${response.statusText}`);
		}

		const body = (await response.json()) as {
			status: string;
			data?: {
				resultType?: string;
				result?: PromQueryResult[];
			};
		};

		if (body.status !== "success" || !body.data?.result) {
			return [];
		}

		return body.data.result;
	}

	async queryCrawlerSeries(
		fromMs: number,
		toMs: number,
		durationMinutes: number
	): Promise<CrawlerStatsRollupPoint[] | null> {
		if (!this.endpoint) return null;

		const startSec = Math.floor(fromMs / 1000);
		const endSec = Math.floor(toMs / 1000);
		const stepSec = pickSigNozStep(durationMinutes);

		const queries: Record<string, string> = {
			videosPerMin: 'sum(rate(cvsa_crawler_events{kind="videosRecorded"}[1m])) * 60',
			requestsPerMin: 'sum(rate(cvsa_crawler_events{kind="httpAttemptsFinished"}[1m])) * 60',
			jobsPerMin: "sum(rate(cvsa_crawler_jobs_results[1m])) * 60",
			inferencesPerMin: 'sum(rate(cvsa_crawler_events{kind="modelInferenceCalls"}[1m])) * 60',
			"queue.waiting": 'sum(cvsa_crawler_queue_jobs{state="waiting"})',
			"queue.active": 'sum(cvsa_crawler_queue_jobs{state="active"})',
			"tracking.overdue": "sum(cvsa_crawler_tracking_overdue)",
		};

		const operations = ["trackingExecution", "httpAttempt", "modelProcess"] as const;
		const quantiles = [0.5, 0.9, 0.95, 0.99] as const;
		for (const op of operations) {
			for (const q of quantiles) {
				queries[`latency.${op}.${q}`] =
					`histogram_quantile(${q}, sum(rate(cvsa_crawler_duration_ms_bucket{operation="${op}"}[1m])) by (le))`;
			}
		}

		try {
			const entries = Object.entries(queries);
			const queryResults = await Promise.all(
				entries.map(async ([key, query]) => {
					try {
						const result = await this.queryRange(query, startSec, endSec, stepSec);
						return [key, result[0]?.values ?? []] as const;
					} catch {
						return [key, []] as const;
					}
				})
			);

			const pointsByTime = new Map<number, Record<string, number | null>>();
			for (const [key, values] of queryResults) {
				for (const [timeSec, valStr] of values) {
					let point = pointsByTime.get(timeSec);
					if (!point) {
						point = {};
						pointsByTime.set(timeSec, point);
					}
					const parsed = parseFloat(valStr);
					point[key] = Number.isFinite(parsed) ? parsed : null;
				}
			}

			if (pointsByTime.size === 0) return null;

			const sortedTimes = [...pointsByTime.keys()].sort((a, b) => a - b);
			return sortedTimes.map((timeSec) => ({
				bucketTime: new Date(timeSec * 1000).toISOString(),
				metricGroup: "crawler:minute",
				metrics: pointsByTime.get(timeSec) ?? {},
				coverage: "complete",
			}));
		} catch {
			return null;
		}
	}
}
