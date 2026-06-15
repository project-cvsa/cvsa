import { z } from "zod";

export const CreateOutboxEntrySchema = z.object({
	aggregateType: z.string(),
	aggregateId: z.number().int(),
	eventType: z.string(),
	payload: z.record(z.string(), z.unknown()).optional(),
});

export const PendingOutboxQuerySchema = z.object({
	limit: z.number().int().positive().default(100),
});

export type CreateOutboxEntryDto = {
	aggregateType: string;
	aggregateId: number;
	eventType: string;
	payload?: Record<string, unknown>;
};

export type OutboxEntryDto = {
	id: number;
	aggregateType: string;
	aggregateId: number;
	eventType: string;
	payload: unknown;
	status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";
	retryCount: number;
	lastError: string | null;
	nextRetryAt: string | null;
	createdAt: string;
	processedAt: string | null;
};

export type PendingOutboxQueryDto = z.infer<typeof PendingOutboxQuerySchema>;
