import { describe, expect, it } from "bun:test";
import {
	InferenceBatchRequestSchema,
	InferenceBatchResponseSchema,
	InferenceHealthSchema,
	InferencePredictionSchema,
} from "../../src/crawler/inference";

describe("crawler inference contracts", () => {
	it("accepts named text fields and an optional string aid", () => {
		expect(
			InferenceBatchRequestSchema.safeParse([
				{ title: "song", description: "description", tags: ["vocaloid"], aid: "123" },
				{ title: "another", description: "", tags: [] },
			]).success
		).toBe(true);
		expect(
			InferenceBatchRequestSchema.safeParse([
				{ title: "song", description: "description", tags: [], aid: 123 },
			]).success
		).toBe(false);
	});

	it("enforces normalized three-class predictions and the label acceptance rule", () => {
		expect(
			InferencePredictionSchema.safeParse({
				label: 1,
				probabilities: [0.1, 0.8, 0.1],
				accepted: true,
				modelVersion: "akari-3.17",
			}).success
		).toBe(true);
		expect(
			InferencePredictionSchema.safeParse({
				label: 0,
				probabilities: [0.8, 0.1, 0.1],
				accepted: true,
				modelVersion: "akari-3.17",
			}).success
		).toBe(false);
		expect(
			InferencePredictionSchema.safeParse({
				label: 2,
				probabilities: [0.8, 0.2, 0.1],
				accepted: true,
				modelVersion: "akari-3.17",
			}).success
		).toBe(false);
	});

	it("keeps batch array order and reports readiness without local paths", () => {
		const result = InferenceBatchResponseSchema.parse([
			{ label: 1, probabilities: [0.1, 0.8, 0.1], accepted: true, modelVersion: "v1" },
			{ label: 0, probabilities: [0.8, 0.1, 0.1], accepted: false, modelVersion: "v1" },
		]);
		expect(result.map((prediction) => prediction.label)).toEqual([1, 0]);
		expect(InferenceHealthSchema.safeParse({ ready: true, modelVersion: "v1" }).success).toBe(
			true
		);
		expect(
			InferenceHealthSchema.parse({ ready: false, classifierPath: "/model/path" })
		).toEqual({ ready: false });
	});
});
