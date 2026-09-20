import type {
	NetworkApplicationErrorClassifier,
	NetworkApplicationErrorContext,
	NetworkErrorCode,
} from "@cvsa/network-scheduler";

/**
 * Bilibili answers HTTP 200 for business failures, so the HTTP status alone is
 * not a success signal. This module owns the whole mapping from a Bilibili
 * response to a transport-level error code; `@cvsa/network-scheduler` stays
 * unaware of Bilibili semantics and only receives the classifier through its
 * existing `classifyApplicationError` hook.
 *
 * Only codes that name a specific condition are listed; anything else takes the
 * conservative default below.
 *
 * Envelope reference (`{ "code": 0, "message": "...", "data": ... }`): the
 * recorder client in the external `VSCC-Rank` repository
 * (`apps/crawler/src/bilibili.ts`) treats every `code !== 0` payload as a
 * failure.
 *
 * Verification status: the code values below are unverified — they have not been
 * checked against the upstream catalogue
 * (https://github.com/SocialSisterYi/bilibili-API-collect, `docs/misc/errcode.md`).
 * Confirm them there before relying on this list operationally. The blast radius
 * is bounded either way: an unrecognized code is classified as a business error,
 * so at worst a throttling answer is not retried and does not degrade the health
 * of the exit that carried it.
 */

/** Anti-abuse / throttling answers aimed at the exit, not at the requested resource. */
export const BILIBILI_THROTTLING_CODES: ReadonlySet<number> = new Set([
	-352, // 风控校验失败
	-412, // 请求被拦截
	-509, // 请求过于频繁
	-799, // 请求过于频繁，请稍后再试
]);

/** Business answers about the requested resource itself. */
export const BILIBILI_BUSINESS_ERROR_CODES: ReadonlySet<number> = new Set([
	-404, // 视频不存在
	-403, // 访问权限不足
	62002, // 稿件不可见
	62004, // 稿件审核中
	62012, // 仅 UP 主自己可见
]);

/** Bilibili returns this HTTP status when its risk control intercepts a request. */
export const BILIBILI_RISK_CONTROL_HTTP_STATUS = 412;

function readEnvelopeCode(body: string): number | undefined {
	const trimmed = body.trim();
	if (!trimmed.startsWith("{")) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return undefined;
	}

	if (typeof parsed !== "object" || parsed === null || !("code" in parsed)) {
		return undefined;
	}

	const code = parsed.code;
	if (typeof code === "number" && Number.isFinite(code)) return code;
	if (typeof code === "string" && /^-?\d+$/.test(code)) return Number(code);
	return undefined;
}

/**
 * Maps one Bilibili response to a transport error code, or `undefined` when the
 * response carries no application-level failure.
 *
 * - Risk control and rate limiting become `APPLICATION_RATE_LIMIT`, which the
 *   scheduler retries on another adapter and counts against adapter health.
 * - Business failures become `APPLICATION_ERROR`, which is never retried and
 *   never degrades adapter health.
 * - Unknown non-zero codes take the conservative default: no blind retry and no
 *   health penalty.
 * - HTTP 4xx/5xx/429 keep their transport-level meaning.
 */
export function classifyBilibiliResponse(
	context: NetworkApplicationErrorContext
): NetworkErrorCode | undefined {
	if (context.status === BILIBILI_RISK_CONTROL_HTTP_STATUS) return "APPLICATION_RATE_LIMIT";
	if (context.status >= 400) return undefined;

	const code = readEnvelopeCode(context.body);
	if (code === undefined || code === 0) return undefined;
	if (BILIBILI_THROTTLING_CODES.has(code)) return "APPLICATION_RATE_LIMIT";
	if (BILIBILI_BUSINESS_ERROR_CODES.has(code)) return "APPLICATION_ERROR";

	// Unrecognized failure: treat it as a business error so an unknown code can
	// never trigger a retry storm or penalize an otherwise healthy exit.
	return "APPLICATION_ERROR";
}

export function createBilibiliApplicationErrorClassifier(): NetworkApplicationErrorClassifier {
	return classifyBilibiliResponse;
}
