import { Elysia } from "elysia";
import { z } from "zod";
import {
	AppError,
	CreateInvitationRequestSchema,
	CreateInvitationResponseSchema,
	ErrorResponseSchema,
	ListInvitationsResponseSchema,
} from "@cvsa/contracts";
import { invitationService } from "@cvsa/authentication";
import { adminAuthMiddleware } from "@/middlewares";

const InvitationIdParamsSchema = z.object({
	id: z.coerce.number(),
});

const RevokeInvitationResponseSchema = z.object({
	message: z.string(),
});

export const invitationAdminHandler = new Elysia({ prefix: "/admin/invitations" })
	.use(adminAuthMiddleware)
	.onBeforeHandle(({ roleName }) => {
		if (roleName !== "OWNER" && roleName !== "admin") {
			throw new AppError("error.forbidden", "FORBIDDEN", 403, {
				message: "Only system owners and administrators can manage invitation codes.",
			});
		}
	})
	.get(
		"/",
		async () => {
			const data = await invitationService.list();
			return { data };
		},
		{
			detail: {
				summary: "List Invitation Codes",
				description:
					"List all invitation codes along with usage statistics and creator info.",
			},
			response: {
				200: ListInvitationsResponseSchema,
				401: ErrorResponseSchema,
				403: ErrorResponseSchema,
			},
		}
	)
	.post(
		"/",
		async ({ body, user }) => {
			const result = await invitationService.create({
				code: body.code,
				roleName: body.roleName,
				maxUses: body.maxUses,
				expiresInDays: body.expiresInDays,
				createdBy: user.id,
			});
			return {
				message: "Invitation code created successfully.",
				data: result,
			};
		},
		{
			body: CreateInvitationRequestSchema,
			detail: {
				summary: "Create Invitation Code",
				description:
					"Generate a new invitation code granting a specified role upon registration.",
			},
			response: {
				200: CreateInvitationResponseSchema,
				400: ErrorResponseSchema,
				401: ErrorResponseSchema,
				403: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const success = await invitationService.revoke(params.id);
			if (!success) {
				throw new AppError("error.not-found", "NOT_FOUND", 404, {
					message: "Invitation code not found.",
				});
			}
			return {
				message: "Invitation code revoked successfully.",
			};
		},
		{
			params: InvitationIdParamsSchema,
			detail: {
				summary: "Revoke Invitation Code",
				description: "Delete an invitation code by id.",
			},
			response: {
				200: RevokeInvitationResponseSchema,
				401: ErrorResponseSchema,
				403: ErrorResponseSchema,
				404: ErrorResponseSchema,
			},
		}
	);
