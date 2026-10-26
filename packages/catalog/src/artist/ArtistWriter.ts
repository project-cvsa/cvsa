import type { Artist, DatabaseClient, TxClient } from "@cvsa/db";
import { Temporal, toJson } from "@cvsa/db";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { recordOutboxEvent } from "../outbox";
import {
	assertCanCreateArtist,
	assertCanDeleteArtist,
	assertCanUpdateArtist,
} from "./artistPolicy";
import type { ArtistId, CreateArtistInput, UpdateArtistInput } from "./artistTypes";

export class ArtistWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(actor: Principal, input: CreateArtistInput): Promise<Artist> {
		return this.db.transaction((tx) => this.createInTransaction(tx, actor, input));
	}

	async update(actor: Principal, id: ArtistId, input: UpdateArtistInput): Promise<Artist> {
		const updated = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, id, input)
		);
		await this.invalidateCache(id);
		return updated;
	}

	async delete(actor: Principal, id: ArtistId): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, id));
		await this.invalidateCache(id);
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		input: CreateArtistInput
	): Promise<Artist> {
		assertCanCreateArtist(actor);

		const artist = await tx.orm.core.Artist.create({
			name: input.name,
			localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
			language: input.language ?? "zh",
			aliases: input.aliases ?? [],
			description: input.description,
			localizedDescriptions: input.localizedDescriptions
				? toJson(input.localizedDescriptions)
				: undefined,
			userId: input.userId,
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "artist",
			objectId: artist.id,
			type: "CREATE",
			new: toJson(artist),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Artist",
			aggregateId: artist.id,
			eventType: "ArtistCreated",
			payload: toJson(artist),
		});

		return artist;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: ArtistId,
		input: UpdateArtistInput
	): Promise<Artist> {
		assertCanUpdateArtist(actor);

		const existing = await tx.orm.core.Artist.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		const updated = await tx.orm.core.Artist.where({ id }).update({
			name: input.name,
			localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
			language: input.language,
			aliases: input.aliases,
			description: input.description,
			localizedDescriptions: input.localizedDescriptions
				? toJson(input.localizedDescriptions)
				: undefined,
			userId: input.userId,
		});

		if (!updated) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "artist",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Artist",
			aggregateId: id,
			eventType: "ArtistUpdated",
			payload: toJson(updated),
		});

		return updated;
	}

	private async deleteInTransaction(tx: TxClient, actor: Principal, id: ArtistId): Promise<void> {
		assertCanDeleteArtist(actor);

		const existing = await tx.orm.core.Artist.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.core.Artist.where({ id }).update({
			deletedAt: Temporal.Now.instant(),
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "artist",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Artist",
			aggregateId: id,
			eventType: "ArtistDeleted",
			payload: { id },
		});
	}

	private async invalidateCache(id: ArtistId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:artist:details:${id}`);
		}
	}
}
