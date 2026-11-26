import { z } from "zod";
export const DeployServiceSchema = z.enum(["backend", "crawler", "embedding", "web"]);
export const DeployRequestSchema = z.object({
	tag: z.string().regex(/^sha-[a-f0-9]{12,40}$/),
	services: z
		.array(DeployServiceSchema)
		.min(1)
		.default(["backend", "crawler", "embedding", "web"]),
});
export type DeployRequest = z.infer<typeof DeployRequestSchema>;
export const DeployStateSchema = z.object({
	id: z.string(),
	status: z.enum(["deploying", "success", "failed"]),
	tag: z.string(),
	services: z.array(DeployServiceSchema),
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	error: z.string().nullable(),
	exitCode: z.number().int().nullable().default(null),
});
export type DeployState = z.infer<typeof DeployStateSchema>;
