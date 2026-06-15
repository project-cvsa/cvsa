import { mock } from "bun:test";

export function createMockRepository<T extends object>(template: T) {
	const mockRepo = {} as Record<keyof T, ReturnType<typeof mock>>;

	for (const key of Object.keys(template) as (keyof T)[]) {
		if (typeof template[key] === "function") {
			mockRepo[key] = mock(template[key] as never);
		}
	}

	return mockRepo;
}

export const OriginalMeiliSearch = await import("meilisearch");
