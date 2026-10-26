/**
 * Bilibili reports business failures as a numeric `code` inside an HTTP 200
 * body. The crawler needs to tell "this video is gone" apart from "this exit is
 * rate limited", because only the first one should stop being retried.
 */

/** The video no longer exists (`-404 视频不存在` / `啥都木有`). */
const NOT_FOUND_CODES: ReadonlySet<number> = new Set([-404, 62004]);

/** The video exists but is not publicly visible (`62002 稿件不可见`, `-403 访问权限不足`). */
const PRIVATE_CODES: ReadonlySet<number> = new Set([62002, -403, 62012]);

const CODE_PATTERN = /(-?\d{3,6})/;

export type BilibiliVideoAvailability = "deleted" | "private" | "unavailable";

export interface BilibiliErrorClassification {
	/** Business code parsed from the error message, when one is present. */
	code?: number;
	/**
	 * `"deleted"` / `"private"` mean the video itself is gone (`videoStatus`
	 * should follow). `"unavailable"` covers throttling and transient failures.
	 */
	kind: "deleted" | "private" | "unavailable" | "unknown";
}

/**
 * Extract a Bilibili business code from an error thrown by the client.
 *
 * The client embeds the code in the message (`Bilibili video details request
 * failed: -404 啥都木有`), so the message is the only structured input available
 * for errors raised through the session layer.
 */
export function parseBilibiliErrorCode(error: unknown): number | undefined {
	if (typeof error === "number" && Number.isFinite(error)) return error;

	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: error && typeof error === "object" && "message" in error
					? String((error as { message: unknown }).message)
					: undefined;
	if (!message) return undefined;

	const match = CODE_PATTERN.exec(message);
	if (!match?.[1]) return undefined;
	const code = Number(match[1]);
	return Number.isFinite(code) ? code : undefined;
}

/**
 * Best-effort classification used by the discovery pipeline to decide whether a
 * candidate is worth retrying and which `videoStatus` to persist.
 */
export function classifyBilibiliError(error: unknown): BilibiliErrorClassification {
	const code = parseBilibiliErrorCode(error);
	if (code === undefined) return { kind: "unknown" };
	if (NOT_FOUND_CODES.has(code)) return { code, kind: "deleted" };
	if (PRIVATE_CODES.has(code)) return { code, kind: "private" };
	return { code, kind: "unavailable" };
}

/** `videoStatus` value implied by an availability classification, if any. */
export function videoStatusForAvailability(
	classification: BilibiliErrorClassification
): string | undefined {
	if (classification.kind === "deleted" || classification.kind === "private") {
		return classification.kind;
	}
	return undefined;
}

/** Whether the video is gone for good and must not be retried. */
export function isTerminalVideoFailure(classification: BilibiliErrorClassification): boolean {
	return classification.kind === "deleted" || classification.kind === "private";
}
