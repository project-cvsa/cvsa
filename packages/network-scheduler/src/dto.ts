import { z } from "zod";

const AdapterIdSchema = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[a-zA-Z0-9_-]+$/);

export const RateLimitSchema = z.object({
	durationSeconds: z.number().int().positive().max(3_600),
	maxRequests: z.number().int().positive().max(1_000_000),
});

const AdapterBaseSchema = z.object({
	id: AdapterIdSchema,
	enabled: z.boolean().default(true),
	baseWeight: z.number().positive().default(1),
	rateLimits: z.array(RateLimitSchema).default([]),
});

function hasSupportedProxyProtocol(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * `createAxiosNetworkTransport` only implements HTTP/HTTPS proxying. Accepting
 * another scheme here would let an operator persist a configuration that can
 * never work, so the protocol is rejected at validation time.
 */
export const HttpProxyUrlSchema = z
	.url()
	.refine(hasSupportedProxyProtocol, "proxyUrl must use the http: or https: protocol");

export const DirectAdapterConfigSchema = AdapterBaseSchema.extend({
	type: z.literal("direct"),
});

export const HttpProxyAdapterConfigSchema = AdapterBaseSchema.extend({
	type: z.literal("http-proxy"),
	proxyUrl: HttpProxyUrlSchema,
});

export const NetworkAdapterConfigSchema = z.discriminatedUnion("type", [
	DirectAdapterConfigSchema,
	HttpProxyAdapterConfigSchema,
]);

export const RequestAdapterBindingSchema = z.object({
	requestType: z.string().min(1).max(128),
	adapterIds: z.array(AdapterIdSchema).min(1),
});

export const SoftReservePolicySchema = z.object({
	reservedShare: z.number().min(0).max(1),
});

export const HealthConfigSchema = z.object({
	failurePenalty: z.number().gt(0).lt(1).default(0.85),
	recoveryBonus: z.number().gt(0).lt(1).default(0.5),
	minWeightFactor: z.number().gte(0).lt(1).default(0.1),
	/** Consecutive health-affecting failures before the adapter is isolated. */
	failureThreshold: z.number().int().positive().max(100).default(20),
	/** How long an isolated adapter stays out of rotation before a probe is allowed. */
	cooldownMs: z.number().int().positive().max(3_600_000).default(10_000),
});

export const NetworkRuntimeConfigSchema = z
	.object({
		adapters: z.array(NetworkAdapterConfigSchema),
		bindings: z.array(RequestAdapterBindingSchema).optional(),
		requestTypePolicies: z.record(z.string(), SoftReservePolicySchema).optional().default({}),
		health: HealthConfigSchema.optional(),
	})
	.superRefine((config, context) => {
		const adapterIds = new Set<string>();
		for (const adapter of config.adapters) {
			if (adapterIds.has(adapter.id)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate adapter id: ${adapter.id}`,
				});
			}
			adapterIds.add(adapter.id);
		}
		const requestTypes = new Set<string>();
		for (const binding of config.bindings ?? []) {
			if (requestTypes.has(binding.requestType)) {
				context.addIssue({
					code: "custom",
					message: `Duplicate request binding: ${binding.requestType}`,
				});
			}
			requestTypes.add(binding.requestType);
			for (const adapterId of binding.adapterIds) {
				if (!adapterIds.has(adapterId)) {
					context.addIssue({
						code: "custom",
						message: `Binding ${binding.requestType} refers to unknown adapter ${adapterId}`,
					});
				}
			}
		}
		const totalShare = Object.values(config.requestTypePolicies).reduce(
			(sum, policy) => sum + policy.reservedShare,
			0
		);
		if (totalShare > 1) {
			context.addIssue({
				code: "custom",
				message: `Total reserved share across request types (${totalShare}) must not exceed 1`,
			});
		}
	});

export type NetworkAdapterConfig = z.infer<typeof NetworkAdapterConfigSchema>;
export type NetworkRuntimeConfig = z.infer<typeof NetworkRuntimeConfigSchema>;
