import {
	type Artist,
	type DatabaseClient,
	type TxClient,
	artist,
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

		const [created] = await tx
			.insert(artist)
			.values({
				name: input.name,
				localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
				language: input.language ?? "zh",
				aliases: input.aliases ?? [],
				description: input.description,
				localizedDescriptions: input.localizedDescriptions
					? toJson(input.localizedDescriptions)
					: undefined,
				userId: input.userId,
			})
			.returning();
		if (!created) throw new Error("Failed to insert artist");

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "artist",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Artist",
			aggregateId: created.id,
			eventType: "ArtistCreated",
			payload: toJson(created),
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: ArtistId,
		input: UpdateArtistInput
	): Promise<Artist> {
		assertCanUpdateArtist(actor);

		const [existing] = await tx
			.select()
			.from(artist)
			.where(and(eq(artist.id, id), isNull(artist.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		const [updated] = await tx
			.update(artist)
			.set({
				name: input.name,
				localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
				language: input.language,
				aliases: input.aliases,
				description: input.description,
				localizedDescriptions: input.localizedDescriptions
					? toJson(input.localizedDescriptions)
					: undefined,
				userId: input.userId,
			})
			.where(eq(artist.id, id))
			.returning();

		if (!updated) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
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

		const [existing] = await tx
			.select()
			.from(artist)
			.where(and(eq(artist.id, id), isNull(artist.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		await tx.update(artist).set({ deletedAt: Temporal.Now.instant() }).where(eq(artist.id, id));

		await tx.insert(history).values({
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
