import {
	type ArtistRole,
	type DatabaseClient,
	type TxClient,
	artistRole,
	history,
	Temporal,
	toJson,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { recordOutboxEvent } from "../outbox";
import {
	assertCanCreateArtistRole,
	assertCanDeleteArtistRole,
	assertCanUpdateArtistRole,
} from "./artistRolePolicy";
import type { ArtistRoleId, CreateArtistRoleInput, UpdateArtistRoleInput } from "./artistRoleTypes";

export class ArtistRoleWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(actor: Principal, input: CreateArtistRoleInput): Promise<ArtistRole> {
		return this.db.transaction((tx) => this.createInTransaction(tx, actor, input));
	}

	async update(
		actor: Principal,
		id: ArtistRoleId,
		input: UpdateArtistRoleInput
	): Promise<ArtistRole> {
		const updated = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, id, input)
		);
		await this.invalidateCache(id);
		return updated;
	}

	async delete(actor: Principal, id: ArtistRoleId): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, id));
		await this.invalidateCache(id);
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		input: CreateArtistRoleInput
	): Promise<ArtistRole> {
		assertCanCreateArtistRole(actor);

		const [created] = await tx
			.insert(artistRole)
			.values({
				name: input.name,
				language: input.language ?? "zh",
				localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
			})
			.returning();
		if (!created) throw new Error("Failed to insert artist role");

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "artist_role",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "ArtistRole",
			aggregateId: created.id,
			eventType: "ArtistRoleCreated",
			payload: toJson(created),
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: ArtistRoleId,
		input: UpdateArtistRoleInput
	): Promise<ArtistRole> {
		assertCanUpdateArtistRole(actor);

		const [existing] = await tx
			.select()
			.from(artistRole)
			.where(and(eq(artistRole.id, id), isNull(artistRole.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		const [updated] = await tx
			.update(artistRole)
			.set({
				name: input.name,
				language: input.language,
				localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
			})
			.where(eq(artistRole.id, id))
			.returning();

		if (!updated) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "artist_role",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "ArtistRole",
			aggregateId: id,
			eventType: "ArtistRoleUpdated",
			payload: toJson(updated),
		});

		return updated;
	}

	private async deleteInTransaction(
		tx: TxClient,
		actor: Principal,
		id: ArtistRoleId
	): Promise<void> {
		assertCanDeleteArtistRole(actor);

		const [existing] = await tx
			.select()
			.from(artistRole)
			.where(and(eq(artistRole.id, id), isNull(artistRole.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		await tx
			.update(artistRole)
			.set({ deletedAt: Temporal.Now.instant() })
			.where(eq(artistRole.id, id));

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "artist_role",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "ArtistRole",
			aggregateId: id,
			eventType: "ArtistRoleDeleted",
			payload: { id },
		});
	}

	private async invalidateCache(id: ArtistRoleId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:artistRole:details:${id}`);
		}
	}
}
