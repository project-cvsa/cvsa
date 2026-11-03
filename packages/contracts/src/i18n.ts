import { z } from "zod";

export const ClientI18nPayloadSchema = z.object({
	locale: z.string(),
	resources: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.string()))),
});

export type ClientI18nPayload = z.infer<typeof ClientI18nPayloadSchema>;
