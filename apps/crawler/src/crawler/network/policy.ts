import {
	BILIBILI_REQUEST_TYPES,
	NetworkRuntimeConfigSchema,
	type NetworkRuntimeConfig,
} from "@cvsa/contracts";

/** Expand legacy routing into the current request purposes. */
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

	return NetworkRuntimeConfigSchema.parse({ ...config, bindings, requestTypePolicies });
}
