import { describe, expect, test } from "bun:test";
import {
	calculateDailyViewsGain,
	calculateVelocity,
	evaluateNextSchedule,
	getClosetMilestone,
	getMilestoneEtaFactor,
	getRegularSnapshotIntervalHours,
} from "../src/crawler/tracking";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("milestone calculations", () => {
	test("identifies closest milestones correctly", () => {
		expect(getClosetMilestone(10_000)).toBe(100_000);
		expect(getClosetMilestone(99_999)).toBe(100_000);
		expect(getClosetMilestone(100_001)).toBe(1_000_000);
		expect(getClosetMilestone(999_999)).toBe(1_000_000);
		expect(getClosetMilestone(1_200_000)).toBe(2_000_000);
		expect(getClosetMilestone(9_500_000, true)).toBe(10_000_000);
		expect(getClosetMilestone(15_300_000)).toBe(16_000_000);
	});

	test("calculates milestone ETA factor within bounded limits [4.5, 100]", () => {
		const factorSmall = getMilestoneEtaFactor(10);
		const factorMedium = getMilestoneEtaFactor(500);
		const factorLarge = getMilestoneEtaFactor(500_000);

		expect(factorSmall).toBeGreaterThanOrEqual(4.5);
		expect(factorSmall).toBeLessThanOrEqual(100);
		expect(factorMedium).toBeGreaterThanOrEqual(4.5);
		expect(factorMedium).toBeLessThanOrEqual(100);
		expect(factorLarge).toBeGreaterThanOrEqual(4.5);
		expect(factorLarge).toBeLessThanOrEqual(100);
	});
});

describe("calculateVelocity", () => {
	test("calculates views per hour accurately", () => {
		const now = Date.now();
		const oneHourAgo = now - HOUR;
		expect(calculateVelocity(1500, now, 1000, oneHourAgo)).toBe(500);

		const halfHourAgo = now - 30 * MINUTE;
		expect(calculateVelocity(1100, now, 1000, halfHourAgo)).toBe(200);
	});

	test("returns 0 when views did not increase or time is invalid", () => {
		const now = Date.now();
		expect(calculateVelocity(1000, now, 1000, now - HOUR)).toBe(0);
		expect(calculateVelocity(900, now, 1000, now - HOUR)).toBe(0);
		expect(calculateVelocity(1000, now, 500, now)).toBe(0);
		expect(calculateVelocity(1000, now, 500, Number.NaN)).toBe(0);
	});
});

describe("calculateDailyViewsGain", () => {
	test("distinguishes measured zero growth from a missing or invalid baseline", () => {
		const now = 1700000000000;

		expect(calculateDailyViewsGain(100, now, 100, now - HOUR)).toBe(0);
		expect(calculateDailyViewsGain(100, now)).toBeNull();
		expect(calculateDailyViewsGain(100, now, 100)).toBeNull();
		expect(calculateDailyViewsGain(100, now, 100, now)).toBeNull();
		expect(calculateDailyViewsGain(100, now, 100, now + HOUR)).toBeNull();
		expect(calculateDailyViewsGain(100, now, 100, Number.NaN)).toBeNull();
		expect(calculateDailyViewsGain(99, now, 100, now - HOUR)).toBeNull();
	});
});

describe("evaluateNextSchedule", () => {
	const baseNow = 1700000000000;

	test("handles error backoff exponentially", () => {
		const res1 = evaluateNextSchedule({
			aid: 1,
			currentState: "regular",
			currentViews: 1000,
			currentTime: baseNow,
			consecutiveFails: 1,
			policy: { minRegularIntervalHours: 6 },
		});
		expect(res1.reason).toBe("error_retry_backoff");
		expect(res1.nextSnapshotAt.getTime() - baseNow).toBe(5 * MINUTE);

		const res3 = evaluateNextSchedule({
			aid: 1,
			currentState: "regular",
			currentViews: 1000,
			currentTime: baseNow,
			consecutiveFails: 3,
		});
		expect(res3.nextSnapshotAt.getTime() - baseNow).toBe(20 * MINUTE); // 5 * 2^2

		const res10 = evaluateNextSchedule({
			aid: 1,
			currentState: "regular",
			currentViews: 1000,
			currentTime: baseNow,
			consecutiveFails: 10,
		});
		expect(res10.nextState).toBe("regular");
		expect(res10.reason).toBe("transient_error_retry_backoff_capped");
	});

	test("archives only explicit unavailable failures", () => {
		const result = evaluateNextSchedule({
			aid: 1,
			currentState: "regular",
			currentViews: 1000,
			currentTime: baseNow,
			consecutiveFails: 1,
			failureKind: "unavailable",
		});

		expect(result.nextState).toBe("archive");
		expect(result.reason).toBe("video_unavailable_archived");
		expect(result.nextSnapshotAt.getTime() - baseNow).toBe(7 * DAY);
	});

	describe("state: new", () => {
		test("schedules each early sample relative to acceptance time", () => {
			const offsets = [0, 1.5, 3, 5];
			const expectedNextOffsets = [1.5, 3, 5, 10];

			for (const [index, offsetMinutes] of offsets.entries()) {
				const currentTime = baseNow + offsetMinutes * MINUTE;
				const expectedNextOffset = expectedNextOffsets[index] ?? 0;
				const result = evaluateNextSchedule({
					aid: 10,
					currentState: "new",
					currentViews: 100,
					currentTime,
					acceptedAt: baseNow,
					lastCapturedAt: index === 0 ? null : currentTime,
				});

				expect(result.nextState).toBe("new");
				expect(result.reason).toBe("new_video_initial_sample");
				expect(result.nextSnapshotAt.getTime() - baseNow).toBe(expectedNextOffset * MINUTE);
			}
		});

		test("keeps legacy first-sample scheduling when acceptance time is unavailable", () => {
			const result = evaluateNextSchedule({
				aid: 10,
				currentState: "new",
				currentViews: 100,
				currentTime: baseNow,
				publishedAt: baseNow - HOUR,
			});

			expect(result.reason).toBe("new_video_initial_sample");
			expect(result.nextSnapshotAt.getTime() - baseNow).toBe(1.5 * MINUTE);
		});

		test("schedules frequent intervals for fast new videos", () => {
			const res = evaluateNextSchedule({
				aid: 10,
				currentState: "new",
				currentViews: 2000,
				previousViews: 500,
				lastCapturedAt: baseNow - HOUR,
				currentTime: baseNow,
				publishedAt: baseNow - 2 * HOUR,
			});
			// velocity = 1500 / h (> 1000)
			expect(res.velocity).toBe(1500);
			expect(res.priority).toBe(1);
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(15 * MINUTE);
		});

		test("transitions to regular when video is older than 48 hours", () => {
			const res = evaluateNextSchedule({
				aid: 10,
				currentState: "new",
				currentViews: 5000,
				previousViews: 4500,
				lastCapturedAt: baseNow - HOUR,
				currentTime: baseNow,
				publishedAt: baseNow - 49 * HOUR,
				policy: { minRegularIntervalHours: 6 },
			});
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("new_period_expired_48h");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(6 * HOUR);
		});

		test("transitions cold new video to regular after 2 hours", () => {
			const res = evaluateNextSchedule({
				aid: 10,
				currentState: "new",
				currentViews: 15,
				previousViews: 10,
				lastCapturedAt: baseNow - HOUR,
				currentTime: baseNow,
				publishedAt: baseNow - 3 * HOUR,
				policy: { minRegularIntervalHours: 6 },
			});
			// velocity = 5 / h (< 10)
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("new_video_low_velocity_regularized");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(6 * HOUR);
		});
	});

	describe("state: regular", () => {
		test("schedules a baseline when historical growth cannot be calculated", () => {
			const incompleteBaselines = [
				{ previousViews: undefined, lastCapturedAt: undefined },
				{ previousViews: 500, lastCapturedAt: null },
				{ previousViews: 500, lastCapturedAt: baseNow },
				{ previousViews: 500, lastCapturedAt: baseNow + HOUR },
				{ previousViews: 500, lastCapturedAt: Number.NaN },
			];

			for (const baseline of incompleteBaselines) {
				const result = evaluateNextSchedule({
					aid: 20,
					currentState: "regular",
					currentViews: 500,
					previousViews: baseline.previousViews,
					lastCapturedAt: baseline.lastCapturedAt,
					currentTime: baseNow,
					publishedAt: baseNow - 60 * DAY,
					policy: { minRegularIntervalHours: 6 },
				});

				expect(result.nextState).toBe("regular");
				expect(result.reason).toBe("regular_baseline_sample");
				expect(result.nextSnapshotAt.getTime() - baseNow).toBe(6 * HOUR);
			}
		});

		test("normalizes historical view gain to a daily rate", () => {
			// 2 views in 6 hours is 8 views per day, which selects the 12-hour tier.
			const res = evaluateNextSchedule({
				aid: 20,
				currentState: "regular",
				currentViews: 1002,
				previousViews: 1000,
				lastCapturedAt: baseNow - 6 * HOUR,
				currentTime: baseNow,
			});
			expect(res.velocity).toBeCloseTo(1 / 3);
			expect(calculateDailyViewsGain(1002, baseNow, 1000, baseNow - 6 * HOUR)).toBe(8);
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(12 * HOUR);
		});

		test("uses the configured daily tier boundaries", () => {
			expect(getRegularSnapshotIntervalHours(0).intervalHours).toBe(48);
			expect(getRegularSnapshotIntervalHours(5.99).intervalHours).toBe(24);
			expect(getRegularSnapshotIntervalHours(6).intervalHours).toBe(12);
			expect(getRegularSnapshotIntervalHours(24).intervalHours).toBe(4);
			expect(getRegularSnapshotIntervalHours(96).intervalHours).toBe(2);
			expect(getRegularSnapshotIntervalHours(192).intervalHours).toBe(1.5);
		});

		test("promotes to milestone when ETA <= 144 hours", () => {
			// Video has 98,000 views, milestone is 100,000 (remaining 2,000).
			// Velocity: gained 1,000 views in last hour => raw ETA 2h => adjusted ETA well under 144h
			const res = evaluateNextSchedule({
				aid: 20,
				currentState: "regular",
				currentViews: 98_000,
				previousViews: 97_000,
				lastCapturedAt: baseNow - HOUR,
				currentTime: baseNow,
				recentSnapshots: [
					{ capturedAt: baseNow - HOUR, views: 97_000 },
					{ capturedAt: baseNow - 20 * MINUTE, views: 97_600 },
				],
			});
			expect(res.nextState).toBe("milestone");
			expect(res.priority).toBe(1);
			expect(res.targetMilestone).toBe(100_000);
			expect(res.reason).toBe("promoted_to_milestone");
		});

		test("demotes old inactive video to archive", () => {
			const res = evaluateNextSchedule({
				aid: 20,
				currentState: "regular",
				currentViews: 500,
				previousViews: 500,
				lastCapturedAt: baseNow - 24 * HOUR,
				currentTime: baseNow,
				publishedAt: baseNow - 60 * DAY,
			});
			expect(res.velocity).toBe(0);
			expect(res.nextState).toBe("archive");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(7 * DAY);
		});
	});

	describe("state: milestone", () => {
		test("transitions back to regular once milestone is achieved", () => {
			const res = evaluateNextSchedule({
				aid: 30,
				currentState: "milestone",
				currentViews: 100_005, // exceeded 100,000 milestone!
				targetMilestone: 100_000,
				currentTime: baseNow,
				policy: { minRegularIntervalHours: 6 },
			});
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("milestone_achieved");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(6 * HOUR);
		});

		test("continues high-frequency milestone sprint while approaching", () => {
			const res = evaluateNextSchedule({
				aid: 30,
				currentState: "milestone",
				currentViews: 99_500,
				currentTime: baseNow,
				recentSnapshots: [
					{ capturedAt: baseNow - 3 * MINUTE, views: 99_400 }, // 100 views in 3 min = 2000/h
				],
			});
			expect(res.nextState).toBe("milestone");
			expect(res.priority).toBe(1);
			expect(res.reason).toBe("milestone_sprint");
		});

		test("demotes back to regular if milestone ETA exceeds 144h", () => {
			// Video at 90,000, 10,000 views remaining, but very slow (1 view/hour)
			const res = evaluateNextSchedule({
				aid: 30,
				currentState: "milestone",
				currentViews: 90_000,
				currentTime: baseNow,
				recentSnapshots: [{ capturedAt: baseNow - HOUR, views: 89_999 }],
				policy: { minRegularIntervalHours: 6 },
			});
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("milestone_eta_exceeded_144h");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(6 * HOUR);
		});
	});

	describe("state: archive", () => {
		test("stays in archive for periodic sampling", () => {
			const res = evaluateNextSchedule({
				aid: 40,
				currentState: "archive",
				currentViews: 1000,
				previousViews: 1000,
				currentTime: baseNow,
			});
			expect(res.nextState).toBe("archive");
			expect(res.priority).toBe(4);
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(7 * DAY);
		});

		test("revives back to regular when unexpected view surge happens", () => {
			const res = evaluateNextSchedule({
				aid: 40,
				currentState: "archive",
				currentViews: 1500,
				previousViews: 1000,
				lastCapturedAt: baseNow - HOUR,
				currentTime: baseNow,
				policy: { minRegularIntervalHours: 6 },
			});
			// velocity = 500 / h (> 10)
			expect(res.velocity).toBe(500);
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("archive_revived_due_to_velocity");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(6 * HOUR);
		});
	});
});
