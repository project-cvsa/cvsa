import { describe, expect, test } from "bun:test";
import {
	BilibiliClient,
	createQueryVerificationId,
	getMixinKey,
	secondsUntilNextCstMidnight,
	signWbiQuery,
	toUnixTimestamp,
} from "../src/crawler/bilibili";
import type { NetworkDelegate, NetworkRequest, NetworkResponse } from "@cvsa/network-scheduler";

describe("bilibili signing utilities", () => {
	test("generates random verification ID of length 32", () => {
		const id = createQueryVerificationId();
		expect(id).toHaveLength(32);
		expect(/^[0-9A-Za-z]+$/.test(id)).toBe(true);
	});

	test("converts various timestamp representations to unix seconds", () => {
		const date = new Date("2026-01-01T00:00:00Z");
		expect(toUnixTimestamp(date)).toBe(Math.floor(date.getTime() / 1000));
		expect(toUnixTimestamp(1700000000)).toBe(1700000000);
		expect(toUnixTimestamp(1700000000000)).toBe(1700000000);
	});

	test("generates correct Wbi mixin key and signed query", () => {
		const imgKey = "7cd084481338484ba0e08a3d8beb9821";
		const subKey = "435cd5968e7d4d429a39f65342bc6761";
		const mixin = getMixinKey(imgKey + subKey);
		expect(mixin).toHaveLength(32);

		const signed = signWbiQuery({ foo: "bar", test: 123 }, imgKey, subKey, 1700000000);
		expect(signed).toContain("foo=bar");
		expect(signed).toContain("test=123");
		expect(signed).toContain("wts=1700000000");
		expect(signed).toContain("w_rid=");
	});

	test("calculates seconds until next CST midnight", () => {
		const seconds = secondsUntilNextCstMidnight();
		expect(seconds).toBeGreaterThan(0);
		expect(seconds).toBeLessThanOrEqual(86400);
	});
});

describe("BilibiliClient", () => {
	test("fetches a video view through the unsigned public endpoint", async () => {
		let requestedUrl = "";
		const client = new BilibiliClient({
			request: async (url) => {
				requestedUrl = url;
				return {
					status: 200,
					headers: {},
					body: JSON.stringify({
						code: 0,
						message: "0",
						data: {
							aid: 116902785454457,
							bvid: "BV1SkNv6FEGg",
							pic: "https://example.test/cover.jpg",
							owner: { mid: 1, name: "test" },
						},
					}),
				};
			},
		});

		const view = await client.getVideoView(116902785454457);
		expect(view.pic).toBe("https://example.test/cover.jpg");
		const url = new URL(requestedUrl);
		expect(url.pathname).toBe("/x/web-interface/view");
		expect(url.searchParams.get("aid")).toBe("116902785454457");
	});

	test("fetches bulk video stats and maps fields correctly", async () => {
		let requestedUrl = "";
		const client = new BilibiliClient({
			request: async (url) => {
				requestedUrl = url;
				return {
					status: 200,
					headers: {},
					body: JSON.stringify({
						code: 0,
						message: "0",
						data: [
							{
								id: 123456,
								cnt_info: {
									play: 1000,
									danmaku: 50,
									reply: 20,
									thumb_up: 300,
									coin: 150,
									share: 10,
									collect: 80,
								},
							},
						],
					}),
				};
			},
		});

		const result = await client.bulkGetVideoStats([123456]);
		expect(typeof result).toBe("object");
		if (typeof result === "object") {
			expect(result.data).toHaveLength(1);
			expect(result.data[0]).toEqual({
				aid: 123456,
				views: 1000,
				danmakus: 50,
				replies: 20,
				likes: 300,
				coins: 150,
				shares: 10,
				favorites: 80,
			});
		}

		const url = new URL(requestedUrl);
		expect(url.pathname).toBe("/medialist/gateway/base/resource/infos");
		expect(url.searchParams.get("resources")).toBe("123456:2");
	});

	test("returns error code when bulkGetVideoStats receives API failure", async () => {
		const client = new BilibiliClient({
			request: async () => ({
				status: 200,
				headers: {},
				body: JSON.stringify({
					code: -412,
					message: "Request intercepted",
					data: null,
				}),
			}),
		});

		const result = await client.bulkGetVideoStats([999999]);
		expect(result).toBe(-412);
	});

	test("integrates with NetworkDelegate", async () => {
		let capturedRequest: NetworkRequest | undefined;
		const mockDelegate: NetworkDelegate = {
			async execute(req: NetworkRequest): Promise<NetworkResponse> {
				capturedRequest = req;
				return {
					adapterId: "mock-adapter",
					status: 200,
					headers: {},
					body: JSON.stringify({
						code: 0,
						message: "0",
						data: { aid: 100, bvid: "BV1xx411c7mD" },
					}),
					durationMs: 12,
				};
			},
		};

		const client = new BilibiliClient({ networkDelegate: mockDelegate });
		const view = await client.getVideoView(100);
		expect(view.aid).toBe(100);
		expect(capturedRequest?.requestType).toBe("bilibili-api");
	});
});
