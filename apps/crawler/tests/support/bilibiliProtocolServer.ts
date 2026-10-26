import type { BilibiliRequest } from "../../src/crawler/bilibili";

export type BilibiliProtocolScenario =
	| "success"
	| "rate-limit"
	| "business-error"
	| "missing-video";

export type RecordedBilibiliRequest = {
	method: string;
	path: string;
	search: string;
	headers: Record<string, string>;
	body: string;
};

export type BilibiliProtocolResponse = {
	status?: number;
	headers?: HeadersInit;
	body: unknown;
	delayMs?: number;
};

export type BilibiliProtocolServerOptions = {
	scenario?: BilibiliProtocolScenario;
	responses?: Readonly<Record<string, BilibiliProtocolResponse>>;
	responseFactory?: (
		request: RecordedBilibiliRequest
	) => BilibiliProtocolResponse | undefined | Promise<BilibiliProtocolResponse | undefined>;
	delayMs?: number;
};

export type BilibiliProtocolServer = {
	baseUrl: string;
	getCalls: () => readonly RecordedBilibiliRequest[];
	clearCalls: () => void;
	close: () => Promise<void>;
};

function successResponse(request: RecordedBilibiliRequest): BilibiliProtocolResponse {
	if (request.method === "HEAD" && request.path === "/") {
		return {
			headers: { "set-cookie": "b_nut=1740000000; Path=/; HttpOnly" },
			body: null,
		};
	}

	switch (request.path) {
		case "/x/frontend/finger/spi":
			return {
				body: {
					code: 0,
					message: "0",
					data: { b_3: "test-buvid3", b_4: "test-buvid4" },
				},
			};
		case "/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket":
			return {
				body: {
					code: 0,
					message: "0",
					data: {
						ticket: "test-bili-ticket",
						nav: {
							img: "7cd084481338484ba0e08a3d8beb9821",
							sub: "435cd5968e7d4d429a39f65342bc6761",
						},
					},
				},
			};
		case "/x/web-interface/wbi/search/type":
			return {
				body: {
					code: 0,
					message: "0",
					data: {
						seid: "test-seid",
						page: 1,
						pagesize: 1,
						numResults: 1,
						numPages: 1,
						result: [],
					},
				},
			};
		case "/x/web-interface/view": {
			const aid = new URLSearchParams(request.search).get("aid");
			return {
				body: {
					code: 0,
					message: "0",
					data: {
						aid: Number(aid ?? "100"),
						bvid: "BV1xx411c7mD",
						pic: "https://example.test/cover.jpg",
						title: "Protocol fixture video",
						owner: { mid: 1, name: "Protocol fixture" },
					},
				},
			};
		}
		case "/x/web-interface/archive/related":
			return {
				body: {
					code: 0,
					message: "0",
					data: [
						{
							aid: 200,
							bvid: "BV1yy411c7mE",
							title: "Related protocol fixture",
							pic: "https://example.test/related.jpg",
							owner: { mid: 2, name: "Related fixture", face: "" },
							stat: {
								aid: 200,
								view: 25,
								danmaku: 2,
								reply: 1,
								favorite: 3,
								coin: 1,
								share: 0,
								now_rank: 0,
								his_rank: 0,
								like: 4,
							},
						},
					],
				},
			};
		case "/medialist/gateway/base/resource/infos":
			return {
				body: {
					code: 0,
					message: "0",
					data: [
						{
							id: 100,
							cnt_info: {
								play: 1000,
								danmaku: 10,
								reply: 20,
								thumb_up: 30,
								coin: 40,
								share: 50,
								collect: 60,
							},
						},
					],
				},
			};
		default:
			return {
				status: 404,
				body: { code: -404, message: "Unknown protocol route", data: null },
			};
	}
}

function scenarioResponse(
	request: RecordedBilibiliRequest,
	scenario: BilibiliProtocolScenario
): BilibiliProtocolResponse {
	switch (scenario) {
		case "rate-limit":
			return {
				status: 412,
				body: { code: -412, message: "Request blocked by risk control", data: null },
			};
		case "business-error":
			return {
				body: { code: -352, message: "Request frequency is limited", data: null },
			};
		case "missing-video":
			if (request.path === "/x/web-interface/view") {
				return { body: { code: -404, message: "Video does not exist", data: null } };
			}
			return successResponse(request);
		case "success":
			return successResponse(request);
	}
}

function copyRequest(request: RecordedBilibiliRequest): RecordedBilibiliRequest {
	return {
		...request,
		headers: { ...request.headers },
	};
}

export function createBilibiliProtocolServer(
	options: BilibiliProtocolServerOptions = {}
): BilibiliProtocolServer {
	const calls: RecordedBilibiliRequest[] = [];
	const scenario = options.scenario ?? "success";
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			const headers: Record<string, string> = {};
			request.headers.forEach((value, key) => {
				headers[key] = value;
			});
			const recorded: RecordedBilibiliRequest = {
				method: request.method,
				path: url.pathname,
				search: url.search,
				headers,
				body:
					request.method === "GET" || request.method === "HEAD"
						? ""
						: await request.text(),
			};
			calls.push(recorded);

			const dynamicResponse = await options.responseFactory?.(copyRequest(recorded));
			const routeResponse =
				options.responses?.[`${recorded.method} ${recorded.path}`] ??
				options.responses?.[recorded.path];
			const response =
				dynamicResponse ?? routeResponse ?? scenarioResponse(recorded, scenario);
			const delayMs = response.delayMs ?? options.delayMs ?? 0;
			if (delayMs > 0) {
				await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
			}

			const status = response.status ?? 200;
			const responseHeaders = new Headers(response.headers);
			if (!responseHeaders.has("content-type")) {
				responseHeaders.set("content-type", "application/json; charset=utf-8");
			}
			if (request.method === "HEAD" || status === 204 || status === 304) {
				return new Response(null, { status, headers: responseHeaders });
			}
			return Response.json(response.body, { status, headers: responseHeaders });
		},
	});

	return {
		baseUrl: server.url.origin,
		getCalls: () => calls.map(copyRequest),
		clearCalls: () => {
			calls.length = 0;
		},
		close: async () => {
			await server.stop(true);
		},
	};
}

/**
 * Test-only adapter. It forwards BilibiliClient's injected requests to this
 * local server while preserving the path, query, method, and request headers.
 */
export function createBilibiliProtocolRequest(server: BilibiliProtocolServer): BilibiliRequest {
	return async (url, options) => {
		const sourceUrl = new URL(url);
		const localUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, server.baseUrl);
		const response = await fetch(localUrl, {
			method: options?.method ?? "GET",
			...(options?.headers === undefined ? {} : { headers: options.headers }),
			...(options?.body === undefined ? {} : { body: options.body }),
			...(options?.timeoutMs === undefined
				? {}
				: { signal: AbortSignal.timeout(Math.max(0, Math.ceil(options.timeoutMs))) }),
		});
		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});
		return {
			status: response.status,
			headers,
			body: await response.text(),
		};
	};
}
