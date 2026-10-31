import { AsyncLocalStorage } from "node:async_hooks";
import type { BilibiliRequestPurpose } from "@cvsa/contracts";
const purposes = new AsyncLocalStorage<BilibiliRequestPurpose>();
export function withBilibiliPurpose<T>(
	purpose: BilibiliRequestPurpose,
	work: () => Promise<T>
): Promise<T> {
	return purposes.run(purpose, work);
}
export function bilibiliPurpose(fallback: BilibiliRequestPurpose): BilibiliRequestPurpose {
	return purposes.getStore() ?? fallback;
}
