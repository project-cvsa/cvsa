import { createHmac } from "node:crypto";
import { appLogger } from "@cvsa/logger";
import { MemoryBilibiliCache } from "./cache";
import { secondsUntilNextCstMidnight } from "./signing";
import type {
	BilibiliHttpResponse,
	BilibiliRequest,
	BilibiliResponse,
	DeviceCookies,
	IBilibiliCache,
	WbiCredentials,
} from "./types";

const API_ORIGIN = "https://api.bilibili.com";
const BILI_HOME = "https://www.bilibili.com/";
const BILI_TICKET_TTL_SECONDS = 3 * 24 * 60 * 60;
const DEVICE_COOKIE_CACHE_KEY = "cvsa:bilibili:device-cookies";
const WBI_KEYS_CACHE_KEY = "cvsa:bilibili:wbi-keys";
const BILI_TICKET_CACHE_KEY = "cvsa:bilibili:ticket";

const browserHeaders = {
	Accept: "application/json, text/plain, */*",
	"User-Agent": "Mozilla/5.0 Chrome/131 Safari/537.36",
	Referer: "https://www.bilibili.com/",
};

function getSetCookieValue(headers: Record<string, string>, name: string): string | undefined {
	const setCookie = headers["set-cookie"] ?? headers["Set-Cookie"] ?? "";
	return setCookie.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`, "i"))?.[1];
}

export class BilibiliSession {
	private buvid3: string | undefined;
	private buvid4: string | undefined;
	private bNut: string | undefined;
	private biliTicket: string | undefined;
	private readonly cache: IBilibiliCache;

	constructor(
		private readonly requestImpl: BilibiliRequest,
		cache?: IBilibiliCache
	) {
		this.cache = cache ?? new MemoryBilibiliCache();
	}

	private cookieHeader(): string {
		return [
			this.buvid3 && `buvid3=${this.buvid3}`,
			this.buvid4 && `buvid4=${this.buvid4}`,
			this.bNut && `b_nut=${this.bNut}`,
			this.biliTicket && `bili_ticket=${this.biliTicket}`,
		]
			.filter(Boolean)
			.join("; ");
	}

	async request<T>(
		url: string,
		options: { method?: string; body?: string; headers?: Record<string, string> } = {}
	): Promise<T> {
		const requestStartedAt = performance.now();
		const requestPath = new URL(url).pathname;
		const cookie = this.cookieHeader();
		let response: BilibiliHttpResponse;
		try {
			response = await this.requestImpl(url, {
				...options,
				headers: {
					...(cookie ? { Cookie: cookie } : {}),
					...options.headers,
				},
			});
		} catch (error) {
			appLogger.error("Bilibili HTTP request failed", {
				component: "bilibili-session",
				method: options.method ?? "GET",
				path: requestPath,
				durationMs: Math.round(performance.now() - requestStartedAt),
				error,
			});
			throw error;
		}

		appLogger.debug("Bilibili HTTP request completed", {
			component: "bilibili-session",
			method: options.method ?? "GET",
			path: requestPath,
			status: response.status,
			durationMs: Math.round(performance.now() - requestStartedAt),
		});

		if (response.status < 200 || response.status >= 300) {
			const error = new Error(`Bilibili request failed with HTTP ${response.status}`);
			appLogger.error("Bilibili HTTP status error", {
				component: "bilibili-session",
				method: options.method ?? "GET",
				path: requestPath,
				status: response.status,
			});
			throw error;
		}

		try {
			return JSON.parse(response.body) as T;
		} catch (error) {
			appLogger.error("Bilibili response was not valid JSON", {
				component: "bilibili-session",
				path: requestPath,
				error,
			});
			throw error;
		}
	}

	async getWbiKeys(): Promise<Pick<WbiCredentials, "imgKey" | "subKey">> {
		await this.ensureDeviceCookies();
		const [cachedKeys, cachedTicket] = await Promise.all([
			this.cache.get(WBI_KEYS_CACHE_KEY),
			this.cache.get(BILI_TICKET_CACHE_KEY),
		]);
		const keys = cachedKeys
			? (JSON.parse(cachedKeys) as Pick<WbiCredentials, "imgKey" | "subKey">)
			: undefined;
		const ticket = cachedTicket ?? undefined;
		if (keys && ticket) {
			this.biliTicket = ticket;
			return keys;
		}

		const fresh = await this.obtainWbiCredentials();
		if (!keys) {
			await this.cache.set(
				WBI_KEYS_CACHE_KEY,
				JSON.stringify({ imgKey: fresh.imgKey, subKey: fresh.subKey }),
				secondsUntilNextCstMidnight()
			);
		}
		if (!ticket) {
			await this.cache.set(BILI_TICKET_CACHE_KEY, fresh.ticket, BILI_TICKET_TTL_SECONDS);
		}
		this.biliTicket = ticket ?? fresh.ticket;
		return keys ?? { imgKey: fresh.imgKey, subKey: fresh.subKey };
	}

	private async obtainDeviceCookies(): Promise<DeviceCookies> {
		const finger = await this.request<BilibiliResponse<{ b_3: string; b_4: string }>>(
			`${API_ORIGIN}/x/frontend/finger/spi`
		);
		if (finger.code !== 0 || !finger.data?.b_3 || !finger.data?.b_4) {
			throw new Error(`Bilibili device fingerprint failed: ${finger.code} ${finger.message}`);
		}

		const home = await this.requestImpl(BILI_HOME, {
			headers: browserHeaders,
			method: "HEAD",
		});
		const bNut =
			getSetCookieValue(home.headers, "b_nut") ?? Math.floor(Date.now() / 1000).toString();
		if (home.status < 200 || home.status >= 400) {
			throw new Error(`Bilibili home response failed: HTTP ${home.status}`);
		}

		return { buvid3: finger.data.b_3, buvid4: finger.data.b_4, bNut };
	}

	private async ensureDeviceCookies(): Promise<void> {
		const cached = await this.cache.get(DEVICE_COOKIE_CACHE_KEY);
		const value = cached
			? (JSON.parse(cached) as DeviceCookies)
			: await this.obtainDeviceCookies();
		if (!cached) {
			await this.cache.set(
				DEVICE_COOKIE_CACHE_KEY,
				JSON.stringify(value),
				secondsUntilNextCstMidnight()
			);
		}
		this.buvid3 = value.buvid3;
		this.buvid4 = value.buvid4;
		this.bNut = value.bNut;
	}

	private async obtainWbiCredentials(): Promise<WbiCredentials> {
		const timestamp = Math.floor(Date.now() / 1000);
		const hexsign = createHmac("sha256", "XgwSnGZ1p").update(`ts${timestamp}`).digest("hex");
		const params = new URLSearchParams({
			key_id: "ec02",
			hexsign,
			"context[ts]": String(timestamp),
			csrf: "",
		});
		const response = await this.request<
			BilibiliResponse<{ ticket: string; nav: { img: string; sub: string } }>
		>(`${API_ORIGIN}/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket?${params}`, {
			method: "POST",
		});
		if (response.code !== 0) {
			throw new Error(
				`Bilibili BiliTicket request failed: ${response.code} ${response.message}`
			);
		}
		return {
			ticket: response.data.ticket,
			imgKey: response.data.nav.img,
			subKey: response.data.nav.sub,
		};
	}
}
