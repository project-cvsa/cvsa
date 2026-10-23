import { describe, expect, test } from "bun:test";
import {
	calculateVelocity,
	evaluateNextSchedule,
	getClosetMilestone,
	getMilestoneEtaFactor,
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
		expect(res10.nextState).toBe("archive");
		expect(res10.reason).toBe("max_retries_exceeded_archived");
	});

	describe("state: new", () => {
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
			});
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("new_period_expired_48h");
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
			});
			// velocity = 5 / h (< 10)
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("new_video_low_velocity_regularized");
		});
	});

	describe("state: regular", () => {
		test("schedules according to velocity tiers", () => {
			// velocity = 300 / h
			const res = evaluateNextSchedule({
				aid: 20,
				currentState: "regular",
				currentViews: 1300,
				previousViews: 1000,
				lastCapturedAt: baseNow - HOUR,
				currentTime: baseNow,
			});
			expect(res.velocity).toBe(300);
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(3 * HOUR);
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
			});
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("milestone_achieved");
			expect(res.nextSnapshotAt.getTime() - baseNow).toBe(1 * HOUR);
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
			});
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("milestone_eta_exceeded_144h");
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
			});
			// velocity = 500 / h (> 10)
			expect(res.velocity).toBe(500);
			expect(res.nextState).toBe("regular");
			expect(res.reason).toBe("archive_revived_due_to_velocity");
		});
	});
});
