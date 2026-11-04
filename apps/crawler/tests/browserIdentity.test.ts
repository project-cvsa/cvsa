import { expect, test } from "bun:test";
import { BilibiliSessionConfigSchema } from "@cvsa/contracts";
import { BilibiliClient } from "../src/crawler/bilibili";
import { withBilibiliPurpose } from "../src/crawler/bilibili/requestContext";
import type { NetworkRequest } from "@cvsa/network-scheduler";

for (const family of ["chrome", "edge", "safari"] satisfies Array<"chrome" | "edge" | "safari">) {
	test(`${family} sends a coherent configurable browser identity through every request purpose`, async () => {
		const calls: NetworkRequest[] = [];
		const client = new BilibiliClient({
			sessionConfig: BilibiliSessionConfigSchema.parse({
				browser: {
					family,
					language: "zh-CN,zh;q=0.8",
				},
			}),
			networkDelegate: {
				async execute(request) {
					calls.push(request);
					const path = new URL(request.url).pathname;
					const data = path.includes("finger/spi")
						? { b_3: "device3", b_4: "device4" }
						: path.includes("GenWebTicket")
							? {
									ticket: "ticket",
									nav: { img: "a".repeat(32), sub: "b".repeat(32) },
								}
							: path.includes("search/type")
								? { result: [] }
								: path.includes("resource/infos")
									? []
									: path.includes("view/detail")
										? { View: { aid: 100 } }
										: { aid: 100 };
					return {
						adapterId: "exit",
						status: 200,
						headers: {},
						body: request.method === "HEAD" ? "" : JSON.stringify({ code: 0, data }),
						durationMs: 1,
					};
				},
			},
		});
		await client.start();
		await client.searchVideos("test");
		await client.getVideoView(100);
		await withBilibiliPurpose("tracking", () => client.getVideoDetails(100));
		await client.bulkGetVideoStats([100]);
		await client.diagnostic("exit");
		await client.stop();
		expect(new Set(calls.map((call) => call.requestType))).toEqual(
			new Set([
				"bilibili:credentials",
				"bilibili:tracking",
				"bilibili:search",
				"bilibili:details",
				"bilibili:diagnostic",
			])
		);
		const uas = new Set(calls.map((call) => call.headers?.["User-Agent"]));
		expect(uas.size).toBeGreaterThanOrEqual(1);
		for (const call of calls) {
			const headers = call.headers ?? {};
			expect(headers["Accept-Language"]).toBe("zh-CN,zh;q=0.8");
			expect(headers["Sec-Fetch-Mode"]).toBe("cors");
			expect(headers["Sec-Fetch-Dest"]).toBe("empty");
			expect(headers.Priority).toBeTruthy();
			if (family === "safari") {
				expect(headers["User-Agent"]).toMatch(/Version\/\d+.*Safari/);
				expect(headers["sec-ch-ua"]).toBeUndefined();
			} else if (family === "chrome") {
				expect(headers["User-Agent"]).toMatch(/Chrome\/\d+/);
				expect(headers["sec-ch-ua"]).toMatch(/Chromium|Google Chrome/);
				expect(headers["sec-ch-ua-platform"]).toBeTruthy();
			} else {
				expect(headers["User-Agent"]).toMatch(/Edg\/\d+/);
				expect(headers["sec-ch-ua"]).toMatch(/Microsoft Edge|Chromium/);
				expect(headers["sec-ch-ua-platform"]).toBeTruthy();
			}
		}
		expect(calls.find((call) => call.requestType === "bilibili:diagnostic")?.adapterId).toBe(
			"exit"
		);
	});
}
