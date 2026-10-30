import { createHmac } from "node:crypto";
import { appLogger } from "@cvsa/logger";
import {
	BilibiliCredentialBundleSchema,
	BilibiliSessionConfigSchema,
	BilibiliDeviceResponseSchema,
	BilibiliTicketResponseSchema,
	BilibiliEnvelopeSchema,
	type BilibiliCredentialBundle,
	type BilibiliSessionConfig,
	type BilibiliSessionStatus,
} from "@cvsa/contracts";
import { MemoryBilibiliCache } from "./cache";
import { signWbiQuery } from "./signing";
import { browserRequestHeaders, chooseBrowserIdentity } from "./browserHeaders";
import { boundedOperation } from "../shared/boundedOperation";
import { outsideCrawlerTask } from "../shared/taskContext";
import { RetryLaterError } from "../shared/retryLater";
import type {
	BilibiliHttpResponse,
	BilibiliRequest,
	IBilibiliCache,
	WbiCredentials,
} from "./types";

const API_ORIGIN = "https://api.bilibili.com";
const BILI_HOME = "https://www.bilibili.com/";
const BUNDLE_KEY = "cvsa:bilibili:credential-bundle:v2";
const LEGACY_KEYS = [
	"cvsa:bilibili:device-cookies",
	"cvsa:bilibili:ticket",
	"cvsa:bilibili:wbi-keys",
];

function getSetCookieValue(headers: Record<string, string>, name: string): string | undefined {
	const value =
		Object.entries(headers).find(([key]) => key.toLowerCase() === "set-cookie")?.[1] ?? "";
	return value.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`, "i"))?.[1];
}

export class BilibiliSession {
	private config: BilibiliSessionConfig;
	private readonly cache: IBilibiliCache;
	private bundle: BilibiliCredentialBundle | undefined;
	private initialIdentity: BilibiliCredentialBundle["identity"];
	private credentialsInFlight: Promise<BilibiliCredentialBundle> | undefined;
	private refreshController: AbortController | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private started = false;
	private generation = 0;
	private allowCachedBundle = true;
	private lastRefreshError: string | null = null;
	private nextAttemptAt: number | undefined;
	constructor(
		private readonly requestImpl: BilibiliRequest,
		cache?: IBilibiliCache,
		config?: BilibiliSessionConfig,
		private readonly clock: () => number = Date.now,
		private readonly random: () => number = Math.random,
		private readonly requestTimeoutMs: () => number = () => 8000,
		private readonly operationTimeoutMs: () => number = () => 3000
	) {
		this.cache = cache ?? new MemoryBilibiliCache();
		this.config = BilibiliSessionConfigSchema.parse(config ?? {});
		this.initialIdentity = chooseBrowserIdentity(this.config.browser, this.random);
	}
	private identity(): BilibiliCredentialBundle["identity"] {
		return this.bundle?.identity ?? this.initialIdentity;
	}
	private cookieHeader(bundle = this.bundle): string {
		return bundle && bundle.expiresAt > this.clock()
			? `buvid3=${bundle.buvid3}; buvid4=${bundle.buvid4}; b_nut=${bundle.bNut}; bili_ticket=${bundle.ticket}`
			: "";
	}
	private dueAt(refreshedAt: number): number {
		return Math.min(
			refreshedAt + this.config.refreshIntervalMs,
			Math.floor((refreshedAt + 28800000) / 86400000 + 1) * 86400000 - 28800000
		);
	}
	private matchesIdentity(bundle: BilibiliCredentialBundle): boolean {
		const identity = bundle.identity;
		return (
			(this.config.browser.family === "auto" ||
				identity.family === this.config.browser.family) &&
			identity.language === this.config.browser.language &&
			identity.version ===
				(identity.family === "chrome"
					? this.config.browser.chromeVersion
					: identity.family === "edge"
						? this.config.browser.edgeVersion
						: this.config.browser.safariVersion)
		);
	}
	configure(config: BilibiliSessionConfig): void {
		this.config = BilibiliSessionConfigSchema.parse(config);
		if (!this.bundle)
			this.initialIdentity = chooseBrowserIdentity(this.config.browser, this.random);
		this.nextAttemptAt = undefined;
		this.schedule();
	}
	getStatus(): BilibiliSessionStatus {
		return {
			generation: this.generation,
			ready:
				!!this.bundle &&
				this.bundle.expiresAt > this.clock() &&
				this.matchesIdentity(this.bundle),
			refreshing: !!this.credentialsInFlight,
			browser: `${this.identity().family} ${this.identity().version}`,
			lastRefreshAt: this.bundle?.refreshedAt ?? null,
			nextRefreshAt:
				this.nextAttemptAt ?? (this.bundle ? this.dueAt(this.bundle.refreshedAt) : null),
			lastRefreshError: this.lastRefreshError,
		};
	}
	async start(): Promise<void> {
		this.started = true;
		try {
			await this.refreshCredentials();
		} catch (error) {
			this.noteFailure(error);
		}
		this.schedule();
	}
	async stop(): Promise<void> {
		this.started = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		this.refreshController?.abort();
		await this.credentialsInFlight?.catch(() => {});
	}
	private noteFailure(error: unknown): void {
		this.lastRefreshError =
			error instanceof RetryLaterError ? error.message : "Credential refresh failed";
		this.nextAttemptAt =
			this.clock() +
			(error instanceof RetryLaterError
				? Math.max(this.config.refreshRetryMs, error.delayMs)
				: this.config.refreshRetryMs);
	}
	private schedule(): void {
		if (this.timer) clearTimeout(this.timer);
		if (!this.started) return;
		const at =
			this.nextAttemptAt ??
			(this.bundle && this.matchesIdentity(this.bundle)
				? this.dueAt(this.bundle.refreshedAt)
				: this.clock());
		this.timer = setTimeout(
			() => {
				void this.refreshCredentials()
					.catch((error) => this.noteFailure(error))
					.finally(() => this.schedule());
			},
			Math.max(1, at - this.clock())
		);
		this.timer.unref();
	}
	async invalidate(): Promise<void> {
		this.allowCachedBundle = false;
		this.bundle = undefined;
		this.generation++;
		this.refreshController?.abort();
		await this.credentialsInFlight?.catch(() => {});
		await boundedOperation(
			() => Promise.all([BUNDLE_KEY, ...LEGACY_KEYS].map((key) => this.cache.delete(key))),
			this.operationTimeoutMs()
		);
		this.bundle = undefined;
		this.nextAttemptAt = undefined;
		this.schedule();
	}
	async refreshCredentials(): Promise<BilibiliCredentialBundle> {
		if (!this.credentialsInFlight) {
			this.credentialsInFlight = outsideCrawlerTask(() => this.obtainCredentials())
				.then(async (bundle) => {
					await boundedOperation(
						() =>
							this.cache.set(
								BUNDLE_KEY,
								JSON.stringify(bundle),
								Math.max(1, Math.ceil((bundle.expiresAt - this.clock()) / 1000))
							),
						this.operationTimeoutMs(),
						this.refreshController?.signal
					);
					this.refreshController?.signal.throwIfAborted();
					this.bundle = bundle;
					this.initialIdentity = bundle.identity;
					this.generation++;
					this.lastRefreshError = null;
					this.nextAttemptAt = undefined;
					return bundle;
				})
				.catch((error) => {
					this.noteFailure(error);
					throw error;
				})
				.finally(() => {
					this.credentialsInFlight = undefined;
					this.refreshController = undefined;
					this.schedule();
				});
		}
		return this.credentialsInFlight;
	}
	async getWbiKeys(): Promise<Pick<WbiCredentials, "imgKey" | "subKey">> {
		if (this.allowCachedBundle && !this.bundle && !this.credentialsInFlight) {
			const cached = await boundedOperation(
				() => this.cache.get(BUNDLE_KEY),
				this.operationTimeoutMs()
			);
			if (cached) {
				let value: unknown;
				try {
					value = JSON.parse(cached);
				} catch {
					value = undefined;
				}
				const parsed = BilibiliCredentialBundleSchema.safeParse(value);
				if (parsed.success) this.bundle = parsed.data;
			}
		}
		if (
			!this.bundle ||
			!this.matchesIdentity(this.bundle) ||
			this.dueAt(this.bundle.refreshedAt) <= this.clock() ||
			this.bundle.expiresAt <= this.clock()
		) {
			if (this.nextAttemptAt && this.nextAttemptAt > this.clock())
				throw new RetryLaterError(this.nextAttemptAt - this.clock(), "upstream");
			await this.refreshCredentials();
		}
		const bundle = this.bundle;
		if (!bundle) throw new Error("Bilibili credentials unavailable");
		return { imgKey: bundle.imgKey, subKey: bundle.subKey };
	}
	private eligible(code: number | undefined, message: string | undefined): boolean {
		return (
			code !== undefined &&
			code !== 0 &&
			(this.config.recoveryCodes.includes(code) ||
				/\b(wbi|w_rid|bili_ticket|buvid)\b/i.test(message ?? ""))
		);
	}
	private async recover<T>(work: () => Promise<T>): Promise<T> {
		let attempts = 0;
		while (true) {
			const generation = this.generation;
			try {
				const value = await work();
				const envelope = BilibiliEnvelopeSchema.safeParse(value);
				if (
					!envelope.success ||
					!this.eligible(envelope.data.code, envelope.data.message) ||
					attempts >= this.config.recoveryAttempts
				)
					return value;
			} catch (error) {
				if (
					!(error instanceof RetryLaterError) ||
					!this.eligible(error.applicationCode, error.applicationMessage) ||
					attempts >= this.config.recoveryAttempts
				)
					throw error;
			}
			attempts++;
			if (generation === this.generation) await this.refreshCredentials();
		}
	}
	async request<T>(
		url: string,
		options: NonNullable<Parameters<BilibiliRequest>[1]> = {}
	): Promise<T> {
		return this.recover(() => this.requestOnce<T>(url, options));
	}
	async signedRequest<T>(
		path: string,
		params: Record<string, string | number | boolean>,
		options: NonNullable<Parameters<BilibiliRequest>[1]> = {}
	): Promise<T> {
		await this.getWbiKeys();
		return this.recover(async () => {
			const keys = await this.getWbiKeys();
			const bundle = this.bundle;
			return this.requestOnce<T>(
				`${API_ORIGIN}${path}?${signWbiQuery(params, keys.imgKey, keys.subKey)}`,
				options,
				bundle
			);
		});
	}
	async diagnostic(adapterId: string): Promise<BilibiliHttpResponse> {
		const cookie = this.cookieHeader();
		return this.requestImpl(`${API_ORIGIN}/x/web-interface/nav`, {
			adapterId,
			purpose: "diagnostic",
			headers: browserRequestHeaders(
				this.identity(),
				`${API_ORIGIN}/x/web-interface/nav`,
				"GET",
				cookie ? { Cookie: cookie } : {}
			),
		});
	}
	private async obtainCredentials(): Promise<BilibiliCredentialBundle> {
		const identity = chooseBrowserIdentity(this.config.browser, this.random);
		const controller = new AbortController();
		this.refreshController = controller;
		const request = (url: string, options: NonNullable<Parameters<BilibiliRequest>[1]> = {}) =>
			boundedOperation(
				() =>
					this.requestImpl(url, {
						...options,
						signal: controller.signal,
						purpose: "credentials",
						headers: browserRequestHeaders(
							identity,
							url,
							options.method,
							options.headers
						),
					}),
				options.timeoutMs ?? this.requestTimeoutMs(),
				controller.signal
			);
		const fingerResponse = await request(`${API_ORIGIN}/x/frontend/finger/spi`);
		const finger = BilibiliDeviceResponseSchema.parse(JSON.parse(fingerResponse.body));
		const home = await request(BILI_HOME, {
			method: "HEAD",
			headers: { Cookie: `buvid3=${finger.data.b_3}; buvid4=${finger.data.b_4}` },
		});
		if (home.status < 200 || home.status >= 400)
			throw new Error("Bilibili device handshake failed");
		const bNut =
			getSetCookieValue(home.headers, "b_nut") ?? String(Math.floor(this.clock() / 1000));
		const timestamp = Math.floor(this.clock() / 1000);
		const params = new URLSearchParams({
			key_id: "ec02",
			hexsign: createHmac("sha256", "XgwSnGZ1p").update(`ts${timestamp}`).digest("hex"),
			"context[ts]": String(timestamp),
			csrf: "",
		});
		const response = await request(
			`${API_ORIGIN}/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket?${params}`,
			{
				method: "POST",
				headers: {
					Cookie: `buvid3=${finger.data.b_3}; buvid4=${finger.data.b_4}; b_nut=${bNut}`,
				},
			}
		);
		const fresh = BilibiliTicketResponseSchema.parse(JSON.parse(response.body));
		const refreshedAt = this.clock();
		return {
			buvid3: finger.data.b_3,
			buvid4: finger.data.b_4,
			bNut,
			ticket: fresh.data.ticket,
			imgKey: fresh.data.nav.img,
			subKey: fresh.data.nav.sub,
			identity,
			refreshedAt,
			expiresAt: this.dueAt(refreshedAt),
		};
	}
	private async requestOnce<T>(
		url: string,
		options: NonNullable<Parameters<BilibiliRequest>[1]> = {},
		bundle = this.bundle
	): Promise<T> {
		const requestStartedAt = performance.now();
		const requestPath = new URL(url).pathname;
		const cookie = this.cookieHeader(bundle);
		let response: BilibiliHttpResponse;
		try {
			response = await this.requestImpl(url, {
				...options,
				headers: browserRequestHeaders(
					bundle?.identity ?? this.identity(),
					url,
					options.method,
					{
						...(cookie ? { Cookie: cookie } : {}),
						...options.headers,
					}
				),
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
}
