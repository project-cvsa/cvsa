import {
	type DatabaseClient,
	type InvitationCode,
	type Role,
	type TxClient,
	db,
	invitationCode,
	invitationRedemption,
	role,
	user,
} from "@cvsa/db";
import { and, desc, eq, lt, lte, or, sql } from "drizzle-orm";
import { AppError } from "@cvsa/contracts";
import { Temporal } from "temporal-polyfill";
import { getRandomId } from "../randomId";
import { ensureAdminRole, ensureEditorRole, getRoleByName } from "../user/roles";

export interface CreateInvitationOptions {
	code?: string;
	roleName?: string;
	maxUses?: number;
	expiresInDays?: number | null;
	createdBy?: string | null;
}

export interface InvitationCodeDto {
	id: number;
	code: string;
	roleId: number;
	roleName: string;
	maxUses: number;
	usedCount: number;
	createdBy: string | null;
	creatorUsername?: string | null;
	expiresAt: string | null;
	createdAt: string;
}

export class InvitationService {
	/**
	 * Generate and persist a new invitation code.
	 */
	async create(options: CreateInvitationOptions = {}): Promise<InvitationCodeDto> {
		const targetRoleName = options.roleName ?? "editor";
		let targetRole: Role | null = null;

		if (targetRoleName === "editor") {
			targetRole = await ensureEditorRole();
		} else if (targetRoleName === "admin") {
			targetRole = await ensureAdminRole();
		} else {
			targetRole = await getRoleByName(targetRoleName);
		}

		if (!targetRole) {
			throw new AppError("error.role-not-found", "ROLE_NOT_FOUND", 404, {
				message: `Role '${targetRoleName}' does not exist.`,
			});
		}

		const code = options.code?.trim().toUpperCase() || `CVSA-${getRandomId(8)}`;
		const maxUses = options.maxUses !== undefined ? Math.max(1, options.maxUses) : 1;

		let expiresAt: Temporal.Instant | null = null;
		if (options.expiresInDays && options.expiresInDays > 0) {
			const ms = Date.now() + options.expiresInDays * 86_400_000;
			expiresAt = Temporal.Instant.fromEpochMilliseconds(ms);
		}

		const [created] = await db
			.insert(invitationCode)
			.values({
				code,
				roleId: targetRole.id,
				maxUses,
				usedCount: 0,
				createdBy: options.createdBy ?? null,
				expiresAt,
			})
			.returning();

		if (!created) {
			throw new Error("Failed to create invitation code");
		}

		return {
			id: created.id,
			code: created.code,
			roleId: created.roleId,
			roleName: targetRole.name,
			maxUses: created.maxUses,
			usedCount: created.usedCount,
			createdBy: created.createdBy,
			expiresAt: created.expiresAt ? created.expiresAt.toString() : null,
			createdAt: created.createdAt.toString(),
		};
	}

	/**
	 * Validate that an invitation code exists, is not expired, and has remaining uses.
	 */
	async validate(
		rawCode: string,
		executor: DatabaseClient | TxClient = db
	): Promise<InvitationCode & { role: Role }> {
		const code = rawCode.trim().toUpperCase();
		if (!code) {
			throw new AppError("error.signup.invite_required", "INVITE_CODE_REQUIRED", 400, {
				message: "Invitation code is required.",
			});
		}

		const [row] = await executor
			.select({
				invitation: invitationCode,
				role,
			})
			.from(invitationCode)
			.innerJoin(role, eq(invitationCode.roleId, role.id))
			.where(eq(invitationCode.code, code))
			.limit(1);

		if (!row) {
			throw new AppError("error.signup.invalid_invite", "INVALID_INVITE_CODE", 400, {
				message: "Invalid invitation code.",
			});
		}

		const now = Temporal.Now.instant();
		if (row.invitation.expiresAt) {
			// Compare instant epochs
			if (row.invitation.expiresAt.epochMilliseconds < now.epochMilliseconds) {
				throw new AppError("error.signup.invite_expired", "INVITE_CODE_EXPIRED", 400, {
					message: "Invitation code has expired.",
				});
			}
		}

		if (row.invitation.maxUses > 0 && row.invitation.usedCount >= row.invitation.maxUses) {
			throw new AppError("error.signup.invite_exhausted", "INVITE_CODE_EXHAUSTED", 400, {
				message: "Invitation code has reached its maximum usage limit.",
			});
		}

		return {
			...row.invitation,
			role: row.role,
		};
	}

	private async applyRedemption(
		executor: DatabaseClient | TxClient,
		codeId: number,
		userId: string
	): Promise<void> {
		const [updated] = await executor
			.update(invitationCode)
			.set({
				usedCount: sql`${invitationCode.usedCount} + 1`,
			})
			.where(
				and(
					eq(invitationCode.id, codeId),
					or(
						lte(invitationCode.maxUses, 0),
						lt(invitationCode.usedCount, invitationCode.maxUses)
					)
				)
			)
			.returning();

		if (!updated) {
			throw new AppError("error.signup.invite_exhausted", "INVITE_CODE_EXHAUSTED", 400, {
				message: "Invitation code has reached its maximum usage limit.",
			});
		}

		await executor.insert(invitationRedemption).values({
			invitationCodeId: codeId,
			userId,
		});
	}

	/**
	 * Mark code as used by a registered user.
	 */
	async recordRedemption(
		codeId: number,
		userId: string,
		executor?: DatabaseClient | TxClient
	): Promise<void> {
		if (executor) {
			await this.applyRedemption(executor, codeId, userId);
			return;
		}
		await db.transaction(async (tx) => {
			await this.applyRedemption(tx, codeId, userId);
		});
	}

	/**
	 * List all invitation codes with creator info.
	 */
	async list(): Promise<InvitationCodeDto[]> {
		const rows = await db
			.select({
				id: invitationCode.id,
				code: invitationCode.code,
				roleId: invitationCode.roleId,
				roleName: role.name,
				maxUses: invitationCode.maxUses,
				usedCount: invitationCode.usedCount,
				createdBy: invitationCode.createdBy,
				creatorUsername: user.username,
				expiresAt: invitationCode.expiresAt,
				createdAt: invitationCode.createdAt,
			})
			.from(invitationCode)
			.innerJoin(role, eq(invitationCode.roleId, role.id))
			.leftJoin(user, eq(invitationCode.createdBy, user.id))
			.orderBy(desc(invitationCode.createdAt));

		return rows.map((r) => ({
			id: r.id,
			code: r.code,
			roleId: r.roleId,
			roleName: r.roleName,
			maxUses: r.maxUses,
			usedCount: r.usedCount,
			createdBy: r.createdBy,
			creatorUsername: r.creatorUsername ?? null,
			expiresAt: r.expiresAt ? r.expiresAt.toString() : null,
			createdAt: r.createdAt.toString(),
		}));
	}

	/**
	 * Revoke / delete an invitation code.
	 */
	async revoke(id: number): Promise<boolean> {
		const result = await db.delete(invitationCode).where(eq(invitationCode.id, id)).returning();
		return result.length > 0;
	}
}

export const invitationService = new InvitationService();
