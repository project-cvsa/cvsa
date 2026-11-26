import { z } from "zod";

export const InvitationCodeSchema = z.object({
	id: z.number(),
	code: z.string(),
	roleId: z.number(),
	roleName: z.string(),
	maxUses: z.number(),
	usedCount: z.number(),
	createdBy: z.string().nullable(),
	creatorUsername: z.string().nullable().optional(),
	expiresAt: z.string().nullable(),
	createdAt: z.string(),
});

export type InvitationCodeDto = z.infer<typeof InvitationCodeSchema>;

export const CreateInvitationRequestSchema = z.object({
	code: z.string().min(1).max(64).optional(),
	roleName: z.string().min(1).max(32).optional(),
	maxUses: z.number().int().positive().optional(),
	expiresInDays: z.number().int().positive().nullable().optional(),
});

export type CreateInvitationRequestDto = z.infer<typeof CreateInvitationRequestSchema>;

export const CreateInvitationResponseSchema = z.object({
	message: z.string(),
	data: InvitationCodeSchema,
});

export type CreateInvitationResponseDto = z.infer<typeof CreateInvitationResponseSchema>;

export const ListInvitationsResponseSchema = z.object({
	data: z.array(InvitationCodeSchema),
});

export type ListInvitationsResponseDto = z.infer<typeof ListInvitationsResponseSchema>;
