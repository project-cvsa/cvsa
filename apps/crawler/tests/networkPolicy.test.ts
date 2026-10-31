import { expect, test } from "bun:test";
import { BILIBILI_REQUEST_TYPES, NetworkRuntimeConfigSchema } from "@cvsa/contracts";
import { normalizeBilibiliRuntimeConfig } from "../src/crawler/network/policy";

test("legacy routing gains real purpose bindings while preserving custom reservations", () => {
	const config = normalizeBilibiliRuntimeConfig(
		NetworkRuntimeConfigSchema.parse({
			adapters: [{ id: "exit", type: "direct" }],
			bindings: [
				{ requestType: "bilibili-api", adapterIds: ["exit"] },
				{ requestType: "other", adapterIds: ["exit"] },
			],
			requestTypePolicies: { other: { reservedShare: 0.6 } },
		})
	);
	for (const type of BILIBILI_REQUEST_TYPES)
		expect(
			config.bindings?.find((binding) => binding.requestType === type)?.adapterIds
		).toEqual(["exit"]);
	expect(config.requestTypePolicies?.other?.reservedShare).toBe(0.6);
	expect(
		Object.values(config.requestTypePolicies ?? {}).reduce(
			(sum, policy) => sum + policy.reservedShare,
			0
		)
	).toBeLessThanOrEqual(1 + 1e-9);
	expect(config.requestTypePolicies?.["bilibili:tracking"]?.reservedShare).toBeGreaterThan(
		config.requestTypePolicies?.["bilibili:search"]?.reservedShare ?? 0
	);
});

test("saved purpose reservations control admission policies even after removing the legacy alias", () => {
	const config = normalizeBilibiliRuntimeConfig(
		NetworkRuntimeConfigSchema.parse({
			adapters: [{ id: "exit", type: "direct" }],
			bindings: [{ requestType: "bilibili:tracking", adapterIds: ["exit"] }],
			requestTypePolicies: {
				"bilibili:tracking": { reservedShare: 0.5 },
				"bilibili:search": { reservedShare: 0.1 },
				"bilibili:details": { reservedShare: 0.1 },
				"bilibili:credentials": { reservedShare: 0.1 },
			},
		})
	);
	expect(config.requestTypePolicies?.["bilibili:tracking"]?.reservedShare).toBe(0.5);
	expect(config.requestTypePolicies?.["bilibili:search"]?.reservedShare).toBe(0.1);
	expect(normalizeBilibiliRuntimeConfig(config)).toEqual(config);
});
