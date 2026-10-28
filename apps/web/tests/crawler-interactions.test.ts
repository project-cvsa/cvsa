import { describe, expect, test } from "vitest";
import {
	createRequestSequence,
	getMilestoneActionAid,
} from "../src/components/pages/admin/crawler/videoActions";
import {
	applySaveResult,
	createConfigRequestCoordinator,
} from "../src/components/pages/admin/crawler/saveDraft";
import { toDiscoveryConfigUpdatePayload } from "../src/components/pages/admin/crawler/discoveryConfig";
import {
	toSampleDecisionQuery,
	toSampleLabeledQuery,
} from "../src/components/pages/admin/crawler/discoveryFilters";
import {
	formatMetric,
	formatPercent,
	formatTags,
	formatWaitSeconds,
} from "../src/components/pages/admin/crawler/format";
import {
	describeDecision,
	describeHumanLabel,
	describeMetadataField,
} from "../src/components/pages/admin/crawler/labels";
import {
	formatFieldValue,
	toMetadataFieldDiffs,
} from "../src/components/pages/admin/crawler/metadataHistory";
import {
	clampPage,
	formatPageLabel,
	getPageCount,
	getPageOffset,
	hasNextPage,
} from "../src/components/pages/admin/crawler/pagination";
import { readSeriesMetrics } from "../src/components/pages/admin/crawler/seriesMetrics";

const discoveryConfig = {
	whitelistSingers: ["singer-a"],
	whitelistSongIndicators: ["cover"],
	blacklistKeywords: ["reaction"],
	minDurationSeconds: 30,
	maxDurationSeconds: 900,
	rejectionSampleRate: 0.25,
	modelEnabled: true,
	modelThreshold: 0.72,
};

describe("crawler video interactions", () => {
	test("milestone actions use the displayed record and wait for inspection to finish", () => {
		const displayedTracking = { aid: "video-a" };

		expect(getMilestoneActionAid(displayedTracking, false)).toBe("video-a");
		expect(getMilestoneActionAid(displayedTracking, true)).toBeNull();
		expect(getMilestoneActionAid(null, false)).toBeNull();
	});

	test("only the latest inspection request can update the result", () => {
		const requests = createRequestSequence();
		const olderRequest = requests.start();
		const newerRequest = requests.start();

		expect(requests.isCurrent(olderRequest)).toBe(false);
		expect(requests.isCurrent(newerRequest)).toBe(true);
	});

	test("a save response does not replace a newer draft", () => {
		const submittedDraft = { revision: 1 };
		const newerDraft = { revision: 2 };
		const savedValue = { revision: 1, updatedAt: "server" };

		expect(applySaveResult(submittedDraft, submittedDraft, savedValue)).toBe(savedValue);
		expect(applySaveResult(newerDraft, submittedDraft, savedValue)).toBe(newerDraft);
	});

	test("a reload response started before save cannot replace the saved draft", () => {
		const requests = createConfigRequestCoordinator();
		const reloadRequest = requests.beginLoad();
		const saveRequest = requests.beginSave();

		expect(requests.canApplyLoad(reloadRequest)).toBe(false);
		expect(requests.canApplySave(saveRequest)).toBe(true);
	});
});

describe("discovery settings payload", () => {
	test("includes the classifier switch and threshold", () => {
		const payload = toDiscoveryConfigUpdatePayload(discoveryConfig);

		expect(payload.modelEnabled).toBe(true);
		expect(payload.modelThreshold).toBe(0.72);
	});

	test("forwards an explicit disable so the classifier can be turned off", () => {
		const payload = toDiscoveryConfigUpdatePayload({
			...discoveryConfig,
			modelEnabled: false,
			modelThreshold: 0.3,
		});

		expect(payload.modelEnabled).toBe(false);
		expect(payload.modelThreshold).toBe(0.3);
	});

	test("copies every editable field", () => {
		const payload = toDiscoveryConfigUpdatePayload(discoveryConfig);

		expect(payload).toEqual(discoveryConfig);
	});
});

describe("discovery sample filters", () => {
	test("maps the sampled-rejection filter to the stored decision", () => {
		expect(toSampleDecisionQuery("model_rejected_sampled")).toBe("model_rejected");
		expect(toSampleDecisionQuery("whitelist")).toBe("whitelist");
		expect(toSampleDecisionQuery("model_accepted")).toBe("model_accepted");
	});

	test("omits the decision query for every decision", () => {
		expect(toSampleDecisionQuery("all")).toBeUndefined();
	});

	test("maps the label filter and omits it for all", () => {
		expect(toSampleLabeledQuery("all")).toBeUndefined();
		expect(toSampleLabeledQuery("labeled")).toBe(true);
		expect(toSampleLabeledQuery("unlabeled")).toBe(false);
	});
});

describe("metadata history diff", () => {
	test("renders old/new pairs in stored field order", () => {
		expect(
			toMetadataFieldDiffs({
				title: { old: "Old title", new: "New title" },
				duration: { old: 120, new: 130 },
			})
		).toEqual([
			{ field: "title", before: "Old title", after: "New title" },
			{ field: "duration", before: "120", after: "130" },
		]);
	});

	test("falls back to a plain value row when no pair was stored", () => {
		expect(toMetadataFieldDiffs({ videoStatus: "visible" })).toEqual([
			{ field: "videoStatus", before: "—", after: "visible" },
		]);
	});

	test("formats missing and structured values", () => {
		expect(formatFieldValue(null)).toBe("—");
		expect(formatFieldValue("")).toBe("—");
		expect(formatFieldValue(["a", "b"])).toBe('["a","b"]');
		expect(formatFieldValue(7)).toBe("7");
	});

	test("labels known metadata fields and keeps unknown ones", () => {
		expect(describeMetadataField("ownerName")).toBe("Uploader");
		expect(describeMetadataField("customField")).toBe("customField");
	});
});

describe("pagination helpers", () => {
	test("derives offsets and page counts from a zero-based page", () => {
		expect(getPageOffset(0, 20)).toBe(0);
		expect(getPageOffset(3, 20)).toBe(60);
		expect(getPageCount(0, 20)).toBe(1);
		expect(getPageCount(41, 20)).toBe(3);
	});

	test("clamps and formats the page label", () => {
		expect(clampPage(9, 41, 20)).toBe(2);
		expect(clampPage(-4, 41, 20)).toBe(0);
		expect(formatPageLabel(2, 41, 20)).toBe("3 / 3");
	});

	test("detects a following page", () => {
		expect(hasNextPage(0, 41, 20)).toBe(true);
		expect(hasNextPage(2, 41, 20)).toBe(false);
		expect(hasNextPage(0, 0, 20)).toBe(false);
	});
});

describe("console formatting", () => {
	test("formats rates and metrics without locale separators", () => {
		expect(formatMetric(12)).toBe("12");
		expect(formatMetric(1.234)).toBe("1.23");
		expect(formatPercent(0.1234)).toBe("12.3%");
		expect(formatPercent(1)).toBe("100.0%");
	});

	test("formats wait durations", () => {
		expect(formatWaitSeconds(9)).toBe("9s");
		expect(formatWaitSeconds(75)).toBe("1m 15s");
		expect(formatWaitSeconds(3_900)).toBe("1h 5m");
	});

	test("normalizes metadata tags", () => {
		expect(formatTags(["a", "b"])).toEqual(["a", "b"]);
		expect(formatTags([{ name: "Vocaloid", tagId: 1 }, { tag_name: "原创" }])).toEqual([
			"Vocaloid",
			"原创",
		]);
		expect(formatTags('["a","b"]')).toEqual(["a", "b"]);
		expect(formatTags(null)).toEqual([]);
	});

	test("labels decisions and human labels", () => {
		expect(describeDecision("model_rejected")).toBe("Model rejected (sampled)");
		expect(describeHumanLabel(1)).toBe("Song");
		expect(describeHumanLabel(0)).toBe("Not song");
		expect(describeHumanLabel(null)).toBe("Unlabeled");
	});
});

describe("rollup series summary", () => {
	test("reads flattened counters and skips metrics it cannot name", () => {
		expect(
			readSeriesMetrics({
				"counters.jobsCompleted": 4,
				"counters.snapshotsSaved": 9,
				retries: 2,
				"latencyP95Ms.task": 120,
			})
		).toEqual([
			{ label: "Jobs", value: 4 },
			{ label: "Snapshots", value: 9 },
			{ label: "Retries", value: 2 },
		]);
	});

	test("accepts unflattened counter keys as a fallback", () => {
		expect(readSeriesMetrics({ inferencesRun: 3 })).toEqual([
			{ label: "Inferences", value: 3 },
		]);
	});

	test("returns no rows for an empty bucket", () => {
		expect(readSeriesMetrics({})).toEqual([]);
	});
});
