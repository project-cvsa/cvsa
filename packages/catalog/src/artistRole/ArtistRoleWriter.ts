import type { ArtistRole, DatabaseClient, TxClient } from "@cvsa/db";
import { Temporal, toJson } from "@cvsa/db";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { CatalogOutbox } from "../outbox";
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

		const role = await tx.orm.core.ArtistRole.create({
			name: input.name,
			language: input.language ?? "zh",
			localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "artist_role",
			objectId: role.id,
			type: "CREATE",
			new: toJson(role),
		});

		await CatalogOutbox.recordEvent(tx, {
			aggregateType: "ArtistRole",
			aggregateId: role.id,
			eventType: "ArtistRoleCreated",
			payload: toJson(role),
		});

		return role;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: ArtistRoleId,
		input: UpdateArtistRoleInput
	): Promise<ArtistRole> {
		assertCanUpdateArtistRole(actor);

		const existing = await tx.orm.core.ArtistRole.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		const updated = await tx.orm.core.ArtistRole.where({ id }).update({
			name: input.name,
			language: input.language,
			localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
		});

		if (!updated) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "artist_role",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await CatalogOutbox.recordEvent(tx, {
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

		const existing = await tx.orm.core.ArtistRole.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.core.ArtistRole.where({ id }).update({
			deletedAt: Temporal.Now.instant(),
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "artist_role",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await CatalogOutbox.recordEvent(tx, {
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
