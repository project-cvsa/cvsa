import { afterEach, describe, expect, jest, test } from "bun:test";
import { BilibiliSessionConfigSchema, type BilibiliSessionConfig } from "@cvsa/contracts";
import {
	BilibiliClient,
	type BilibiliRequest,
	type BilibiliHttpResponse,
} from "../src/crawler/bilibili";
import { RetryLaterError } from "../src/crawler/shared/retryLater";
import { MemoryBilibiliCache } from "../src/crawler/bilibili/cache";

type Call = { url: URL; options: NonNullable<Parameters<BilibiliRequest>[1]> };
function protocol() {
	let generation = 0;
	let failTicket = false;
	let rejectedSearches = 0;
	let alwaysReject = false;
	let throttle = false;
	const calls: Call[] = [];
	const key = (value: number) => String(value).repeat(32);
	const request: BilibiliRequest = async (raw, options = {}): Promise<BilibiliHttpResponse> => {
		const url = new URL(raw);
		calls.push({ url, options });
		let body: unknown;
		if (url.pathname.includes("finger/spi")) {
			generation++;
			body = { code: 0, data: { b_3: `device-${generation}`, b_4: `device4-${generation}` } };
		} else if (options.method === "HEAD")
			return { status: 200, headers: { "set-cookie": "b_nut=123; Path=/" }, body: "" };
		else if (url.pathname.includes("GenWebTicket")) {
			if (failTicket) throw new Error("ticket unavailable");
			body = {
				code: 0,
				data: {
					ticket: `ticket-${generation}`,
					nav: { img: key(generation), sub: key(generation + 1) },
				},
			};
		} else if (url.pathname.includes("search/type")) {
			if (throttle)
				throw new RetryLaterError(5000, "upstream", -352, "Request frequency is limited");
			if (alwaysReject || rejectedSearches++ === 0)
				body = { code: -403, message: "WBI signature invalid" };
			else body = { code: 0, data: { seid: "ok", result: [] } };
		} else body = { code: 0, data: { aid: 100 } };
		return { status: 200, headers: {}, body: JSON.stringify(body) };
	};
	return {
		calls,
		key,
		request,
		get generation() {
			return generation;
		},
		fail() {
			failTicket = true;
		},
		throttle() {
			throttle = true;
		},
		rejectAlways() {
			alwaysReject = true;
		},
	};
}
const clients: BilibiliClient[] = [];
function client(
	request: BilibiliRequest,
	config: Partial<BilibiliSessionConfig> = {},
	cache = new MemoryBilibiliCache()
) {
	const value = new BilibiliClient({
		request,
		cache,
		sessionConfig: BilibiliSessionConfigSchema.parse(config),
		random: () => 0,
	});
	clients.push(value);
	return value;
}
/**
 * Fake timers fire their callbacks synchronously, but the refresh that follows
 * resumes through microtasks. Draining those microtasks is deterministic; this
 * does not depend on wall-clock time.
 */
async function until(check: () => boolean) {
	for (let i = 0; i < 500; i++) {
		if (check()) return;
		await Promise.resolve();
	}
	throw new Error("Expected asynchronous session transition");
}
afterEach(async () => {
	for (const value of clients.splice(0)) await value.stop();
	jest.useRealTimers();
	jest.restoreAllMocks();
});

describe("credential lifecycle", () => {
	test("refreshes on startup, at its interval and at Beijing midnight without business requests", async () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-10-30T14:30:00Z"));
		const server = protocol();
		const value = client(server.request);
		await value.start();
		expect(value.getSessionStatus()).toMatchObject({ ready: true, generation: 1 });
		jest.advanceTimersByTime(3600000);
		await until(() => value.getSessionStatus().generation === 2);
		expect(value.getSessionStatus().nextRefreshAt).toBe(
			new Date("2026-10-30T16:00:00Z").getTime()
		);
		jest.advanceTimersByTime(1800000);
		await until(() => value.getSessionStatus().generation === 3);
		expect(server.calls.every((call) => call.options.purpose === "credentials")).toBe(true);
		await value.stop();
		jest.advanceTimersByTime(3600000);
		expect(server.generation).toBe(3);
	});

	test("merges simultaneous refreshes and publishes only a complete bundle", async () => {
		const server = protocol();
		const cache = new MemoryBilibiliCache();
		const value = client(server.request, {}, cache);
		await Promise.all(Array.from({ length: 8 }, () => value.refreshCredentials()));
		expect(server.generation).toBe(1);
		server.fail();
		await expect(value.refreshCredentials()).rejects.toThrow("ticket unavailable");
		await value.getVideoView(100);
		const used = server.calls.at(-1)?.options.headers;
		expect(used?.Cookie).toContain("device-1");
		expect(used?.Cookie).toContain("ticket-1");

		const callsBeforeRestore = server.calls.length;
		const restored = client(server.request, {}, cache);
		// A signed request can restore the last complete bundle despite the failed refresh.
		server.throttle();
		await expect(restored.searchVideos("test")).rejects.toBeInstanceOf(RetryLaterError);
		const restoredCalls = server.calls.slice(callsBeforeRestore);
		expect(restoredCalls.some((call) => call.url.pathname.includes("finger/spi"))).toBe(false);
		expect(restoredCalls.at(-1)?.options.headers?.Cookie).toContain("device-1");
		expect(restoredCalls.at(-1)?.options.headers?.Cookie).toContain("ticket-1");
	});

	test("rebuilds once and re-signs the original search using the replacement credentials", async () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date("2026-10-30T14:30:00Z"));
		jest.spyOn(Math, "random").mockReturnValue(0);
		const server = protocol();
		const value = client(server.request);
		const result = await value.searchVideos("test");
		expect(result.code).toBe(0);
		expect(server.generation).toBe(2);
		const searches = server.calls.filter((call) => call.url.pathname.includes("search/type"));
		expect(searches).toHaveLength(2);
		expect(searches[0].options.headers?.Cookie).toContain("ticket-1");
		expect(searches[1].options.headers?.Cookie).toContain("ticket-2");
		// Same request parameters and timestamp; only the credential keys changed.
		for (const [name, value] of searches[0].url.searchParams)
			if (name !== "w_rid") expect(searches[1].url.searchParams.get(name)).toBe(value);
		expect(searches[1].url.searchParams.get("wts")).toBe(
			searches[0].url.searchParams.get("wts")
		);
		expect(searches[1].url.searchParams.get("w_rid")).not.toBe(
			searches[0].url.searchParams.get("w_rid")
		);
	});

	test("bounds credential retries and never refreshes for ordinary throttling", async () => {
		const server = protocol();
		server.rejectAlways();
		const value = client(server.request);
		expect((await value.searchVideos("test")).code).toBe(-403);
		expect(server.generation).toBe(2);
		server.throttle();
		await expect(value.searchVideos("test")).rejects.toBeInstanceOf(RetryLaterError);
		expect(server.generation).toBe(2);
	});

	test("invalidation clears the device and ticket until a new handshake completes", async () => {
		const server = protocol();
		const value = client(server.request);
		await value.refreshCredentials();
		await value.invalidateCredentials();
		expect(value.getSessionStatus().ready).toBe(false);
		await value.getVideoView(100);
		expect(server.calls.at(-1)?.options.headers?.Cookie).toBeUndefined();
		await value.refreshCredentials();
		expect(value.getSessionStatus().ready).toBe(true);
		await value.getVideoView(100);
		const cookie = server.calls.at(-1)?.options.headers?.Cookie;
		expect(cookie).toContain("device-2");
		expect(cookie).toContain("ticket-2");
		expect(cookie).not.toContain("ticket-1");
	});

	test("refresh failure backs off rather than starting a handshake for each queued request", async () => {
		const server = protocol();
		server.fail();
		const value = client(server.request);
		await value.start();
		for (let i = 0; i < 3; i++)
			await expect(value.searchVideos("test")).rejects.toBeInstanceOf(RetryLaterError);
		expect(server.generation).toBe(1);
	});
});
