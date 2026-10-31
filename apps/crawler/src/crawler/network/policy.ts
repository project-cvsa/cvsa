import {
	BILIBILI_REQUEST_TYPES,
	NetworkRuntimeConfigSchema,
	type NetworkRuntimeConfig,
} from "@cvsa/contracts";

const DEFAULT_RESERVATIONS: NetworkRuntimeConfig["requestTypePolicies"] = {
	"bilibili:tracking": { reservedShare: 0.65 },
	"bilibili:search": { reservedShare: 0.05 },
	"bilibili:details": { reservedShare: 0.05 },
	"bilibili:credentials": { reservedShare: 0.1 },
};

/** Upgrade legacy bindings without replacing an operator's explicit reservations. */
export function normalizeBilibiliRuntimeConfig(input: NetworkRuntimeConfig): NetworkRuntimeConfig {
	const config = NetworkRuntimeConfigSchema.parse(input);
	const fallback =
		config.bindings?.find((binding) => binding.requestType === "bilibili-api") ??
		config.bindings?.find((binding) => BILIBILI_REQUEST_TYPES.includes(binding.requestType));
	if (!fallback) return config;
	const bindings = [...(config.bindings ?? [])];
	for (const requestType of BILIBILI_REQUEST_TYPES)
		if (!bindings.some((binding) => binding.requestType === requestType))
			bindings.push({ requestType, adapterIds: [...fallback.adapterIds] });
	const requestTypePolicies = { ...(config.requestTypePolicies ?? {}) };
	delete requestTypePolicies["bilibili-api"];
	const existingTotal = Object.values(requestTypePolicies).reduce(
		(sum, policy) => sum + policy.reservedShare,
		0
	);
	const missing = Object.entries(DEFAULT_RESERVATIONS ?? {}).filter(
		([name]) => requestTypePolicies[name] === undefined
	);
	const requested = missing.reduce((sum, [, policy]) => sum + policy.reservedShare, 0);
	const scale = requested > 0 ? Math.min(1, Math.max(0, 1 - existingTotal) / requested) : 1;
	for (const [name, policy] of missing)
		requestTypePolicies[name] = { reservedShare: policy.reservedShare * scale };
	return NetworkRuntimeConfigSchema.parse({ ...config, bindings, requestTypePolicies });
}
