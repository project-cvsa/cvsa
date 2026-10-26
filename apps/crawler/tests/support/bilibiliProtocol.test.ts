import { describe, expect, test } from "bun:test";
import { BilibiliClient } from "../../src/crawler/bilibili";
import {
	createBilibiliProtocolRequest,
	createBilibiliProtocolServer,
} from "./bilibiliProtocolServer";

describe("Bilibili public HTTP protocol", () => {
	test("uses the public view, related-video, and bulk-stats routes", async () => {
		const server = createBilibiliProtocolServer();
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			const view = await client.getVideoView(100);
			const related = await client.getRelatedVideos(100);
			const stats = await client.bulkGetVideoStats([100, 100]);

			expect(view.aid).toBe(100);
			expect(view.title).toBe("Protocol fixture video");
			expect(related).toHaveLength(1);
			expect(related[0].aid).toBe(200);
			if (typeof stats === "number") {
				throw new Error(`Expected parsed stats, received API error code ${stats}`);
			}
			expect(stats.data).toEqual([
				{
					aid: 100,
					views: 1000,
					danmakus: 10,
					replies: 20,
					likes: 30,
					coins: 40,
					shares: 50,
					favorites: 60,
				},
			]);

			const calls = server.getCalls();
			expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
				"GET /x/web-interface/view",
				"GET /x/web-interface/archive/related",
				"GET /medialist/gateway/base/resource/infos",
			]);
			expect(new URLSearchParams(calls[0].search).get("aid")).toBe("100");
			expect(new URLSearchParams(calls[1].search).get("aid")).toBe("100");
			expect(new URLSearchParams(calls[2].search).get("resources")).toBe("100:2");
		} finally {
			await server.close();
		}
	});

	test("performs the WBI ticket and signed-search protocol with session cookies", async () => {
		const server = createBilibiliProtocolServer();
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			const result = await client.searchVideos("花絮", { page: 2 });

			expect(result.data.seid).toBe("test-seid");
			const calls = server.getCalls();
			expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
				"GET /x/frontend/finger/spi",
				"HEAD /",
				"POST /bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket",
				"GET /x/web-interface/wbi/search/type",
			]);

			const ticketRequest = calls[2];
			expect(ticketRequest.search).toContain("key_id=ec02");
			expect(ticketRequest.body).toBe("");
			expect(ticketRequest.headers.cookie).toContain("buvid3=test-buvid3");
			expect(ticketRequest.headers.cookie).toContain("b_nut=1740000000");

			const searchRequest = calls[3];
			const params = new URLSearchParams(searchRequest.search);
			expect(params.get("keyword")).toBe("花絮");
			expect(params.get("page")).toBe("2");
			expect(params.get("wts")).not.toBeNull();
			expect(params.get("w_rid")).toMatch(/^[0-9a-f]{32}$/);
			expect(searchRequest.headers.cookie).toContain("bili_ticket=test-bili-ticket");
			expect(searchRequest.headers.referer).toBe("https://search.bilibili.com");
		} finally {
			await server.close();
		}
	});

	test("returns an HTTP risk-control response for throttled requests", async () => {
		const server = createBilibiliProtocolServer({ scenario: "rate-limit" });
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			await expect(client.getVideoView(100)).rejects.toThrow(
				"Bilibili request failed with HTTP 412"
			);
			expect(server.getCalls()).toHaveLength(1);
		} finally {
			await server.close();
		}
	});

	test("returns a Bilibili business error without treating it as an HTTP failure", async () => {
		const server = createBilibiliProtocolServer({ scenario: "business-error" });
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			await expect(client.getVideoView(100)).rejects.toThrow(
				"Bilibili video view request failed: -352 Request frequency is limited"
			);
			expect(server.getCalls()[0].headers.referer).toBe("https://www.bilibili.com/");
		} finally {
			await server.close();
		}
	});

	test("returns the API error code when bulk stats fail", async () => {
		const server = createBilibiliProtocolServer({ scenario: "business-error" });
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			expect(await client.bulkGetVideoStats([100])).toBe(-352);
			expect(server.getCalls()).toHaveLength(1);
		} finally {
			await server.close();
		}
	});

	test("represents a missing video as the public API's business-level not-found response", async () => {
		const server = createBilibiliProtocolServer({ scenario: "missing-video" });
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			await expect(client.getVideoView(404)).rejects.toThrow(
				"Bilibili video view request failed: -404 Video does not exist"
			);
			const calls = server.getCalls();
			expect(new URLSearchParams(calls[0].search).get("aid")).toBe("404");
		} finally {
			await server.close();
		}
	});

	test("supports request-specific response injection and delayed responses", async () => {
		const server = createBilibiliProtocolServer({
			responses: {
				"/x/web-interface/view": {
					delayMs: 35,
					body: {
						code: 0,
						message: "0",
						data: {
							aid: 321,
							bvid: "BV1xx411c7mD",
							pic: "https://example.test/fixed.jpg",
							title: "Fixed response",
							owner: { mid: 3, name: "Fixed fixture" },
						},
					},
				},
			},
			responseFactory: (request) => {
				if (request.path !== "/x/web-interface/archive/related") return undefined;
				return {
					body: {
						code: 0,
						message: "0",
						data: [],
					},
				};
			},
		});
		try {
			const client = new BilibiliClient({ request: createBilibiliProtocolRequest(server) });
			const startedAt = performance.now();
			const view = await client.getVideoView(321);
			const related = await client.getRelatedVideos(321);
			const elapsedMs = performance.now() - startedAt;

			expect(view.title).toBe("Fixed response");
			expect(view.aid).toBe(321);
			expect(related).toEqual([]);
			expect(elapsedMs).toBeGreaterThanOrEqual(25);
			expect(server.getCalls().map(({ path }) => path)).toEqual([
				"/x/web-interface/view",
				"/x/web-interface/archive/related",
			]);
		} finally {
			await server.close();
		}
	});

	test("aborts a delayed local request when its timeout deadline expires", async () => {
		const server = createBilibiliProtocolServer({ delayMs: 80 });
		try {
			const request = createBilibiliProtocolRequest(server);
			await expect(
				request("https://api.bilibili.com/x/web-interface/view?aid=321", {
					timeoutMs: 10,
				})
			).rejects.toThrow();
			expect(server.getCalls()).toHaveLength(1);
			expect(server.getCalls()[0].path).toBe("/x/web-interface/view");
		} finally {
			await server.close();
		}
	});
});
