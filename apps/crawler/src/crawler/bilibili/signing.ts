import { createHash } from "node:crypto";

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MIXIN_KEY_ENCODE_TABLE = [
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
	28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
	54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
] as const;

export function createQueryVerificationId(): string {
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
	let id = "";
	for (let index = 0; index < 32; index++) {
		id += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return id;
}

export function toUnixTimestamp(value: number | Date): number {
	return Math.floor(
		(value instanceof Date ? value.getTime() : value > 10_000_000_000 ? value : value * 1000) /
			1000
	);
}

export function getMixinKey(origKey: string): string {
	return MIXIN_KEY_ENCODE_TABLE.map((index) => origKey[index])
		.join("")
		.slice(0, 32);
}

export function signWbiQuery(
	params: Record<string, string | number | boolean>,
	imgKey: string,
	subKey: string,
	wts = Math.floor(Date.now() / 1000)
): string {
	const mixinKey = getMixinKey(imgKey + subKey);
	const withTime: Record<string, string | number | boolean> = {
		...params,
		wts,
	};
	const query = Object.keys(withTime)
		.sort()
		.map(
			(key) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(String(withTime[key]).replace(/[!'()*]/g, ""))}`
		)
		.join("&");
	const wRid = createHash("md5")
		.update(query + mixinKey)
		.digest("hex");
	return `${query}&w_rid=${wRid}`;
}

export function secondsUntilNextCstMidnight(now = Date.now()): number {
	const nextMidnight = (Math.floor((now + CST_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - CST_OFFSET_MS;
	return Math.max(1, Math.ceil((nextMidnight - now) / 1000));
}
