import { DDSketch } from "@datadog/sketches-js";
import {
	CRAWLER_SKETCH_ALGORITHM,
	CRAWLER_SKETCH_RELATIVE_ACCURACY,
	CRAWLER_SKETCH_VERSION,
	type CrawlerDistribution,
	type CrawlerDistributionSummary,
} from "@cvsa/contracts";

export const DEFAULT_QUANTILES = [0.5, 0.9, 0.95, 0.99] as const;

export function createSketch(): DDSketch {
	return new DDSketch({ relativeAccuracy: CRAWLER_SKETCH_RELATIVE_ACCURACY });
}

export function emptyDistribution(): CrawlerDistribution {
	return {
		algorithm: CRAWLER_SKETCH_ALGORITHM,
		version: CRAWLER_SKETCH_VERSION,
		relativeAccuracy: CRAWLER_SKETCH_RELATIVE_ACCURACY,
		count: 0,
		sum: 0,
		min: null,
		max: null,
		data: "",
	};
}

export function serializeSketch(sketch: DDSketch): CrawlerDistribution {
	if (sketch.count === 0) return emptyDistribution();
	return {
		algorithm: CRAWLER_SKETCH_ALGORITHM,
		version: CRAWLER_SKETCH_VERSION,
		relativeAccuracy: CRAWLER_SKETCH_RELATIVE_ACCURACY,
		count: sketch.count,
		sum: sketch.sum,
		min: sketch.min,
		max: sketch.max,
		data: Buffer.from(sketch.toProto()).toString("base64"),
	};
}

export function deserializeDistribution(distribution: CrawlerDistribution): DDSketch {
	if (distribution.count === 0 || distribution.data.length === 0) return createSketch();
	const sketch = DDSketch.fromProto(Buffer.from(distribution.data, "base64"));
	// `fromProto` drops the summary statistics; restore the independently stored
	// values so merged means and extrema stay exact.
	sketch.count = distribution.count;
	sketch.sum = distribution.sum;
	sketch.min = distribution.min ?? Number.POSITIVE_INFINITY;
	sketch.max = distribution.max ?? Number.NEGATIVE_INFINITY;
	return sketch;
}

export function mergeDistributionInto(target: DDSketch, distribution: CrawlerDistribution): void {
	if (distribution.count === 0) return;
	target.merge(deserializeDistribution(distribution));
}

function quantile(sketch: DDSketch, value: number): number | null {
	if (sketch.count === 0) return null;
	if (value <= 0) return sketch.min;
	if (value >= 1) return sketch.max;
	const estimate = sketch.getValueAtQuantile(value);
	return Math.min(sketch.max, Math.max(sketch.min, estimate));
}

export function summarizeSketch(
	sketch: DDSketch,
	quantiles: readonly number[] = DEFAULT_QUANTILES
): CrawlerDistributionSummary {
	if (sketch.count === 0) return { count: 0, mean: null, min: null, max: null, quantiles: {} };
	return {
		count: sketch.count,
		mean: sketch.sum / sketch.count,
		min: sketch.min,
		max: sketch.max,
		quantiles: Object.fromEntries(
			quantiles.map((value) => [String(value), quantile(sketch, value)])
		),
	};
}

export function summarizeDistribution(
	distribution: CrawlerDistribution,
	quantiles: readonly number[] = DEFAULT_QUANTILES
): CrawlerDistributionSummary {
	return summarizeSketch(deserializeDistribution(distribution), quantiles);
}

export function mergeDistributions(
	distributions: readonly CrawlerDistribution[]
): CrawlerDistribution {
	const sketch = createSketch();
	for (const distribution of distributions) mergeDistributionInto(sketch, distribution);
	return serializeSketch(sketch);
}
