import type { DatabaseClient, Song, TxClient } from "@cvsa/db";
import { toJson, toInstant } from "@cvsa/db";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { recordOutboxEvent } from "../outbox";
import { assertCanCreateSong, assertCanDeleteSong, assertCanUpdateSong } from "./songPolicy";
import type { CreateSongInput, SongId, UpdateSongInput } from "./songTypes";

export class SongWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(actor: Principal, input: CreateSongInput): Promise<Song> {
		return this.db.transaction((tx) => this.createInTransaction(tx, actor, input));
	}

	async update(actor: Principal, id: SongId, input: UpdateSongInput): Promise<Song> {
		const updated = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, id, input)
		);
		await this.invalidateCache(id);
		return updated;
	}

	async delete(actor: Principal, id: SongId): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, id));
		await this.invalidateCache(id);
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		input: CreateSongInput
	): Promise<Song> {
		assertCanCreateSong(actor);

		const { performances, creations, lyrics, publishedAt, ...restSongData } = input;

		const song = await tx.orm.core.Song.create({
			...restSongData,
			...(publishedAt !== undefined ? { publishedAt: toInstant(publishedAt) } : {}),
		});

		if (performances && performances.length > 0) {
			await tx.orm.core.Performance.createAll(
				performances.map((p) => ({
					songId: song.id,
					singerId: p.singerId,
					voicebankId: p.voicebankId,
					svsEngineId: p.svsEngineId,
					svsEngineVersionId: p.svsEngineVersionId,
				}))
			);
		}

		if (creations && creations.length > 0) {
			await tx.orm.core.Creation.createAll(
				creations.map((c) => ({
					songId: song.id,
					artistId: c.artistId,
					artistRoleId: c.roleId,
				}))
			);
		}

		if (lyrics && lyrics.length > 0) {
			await tx.orm.core.Lyrics.createAll(
				lyrics.map((l) => ({
					songId: song.id,
					language: l.language,
					isTranslated: l.isTranslated,
					plainText: l.plainText,
					ttml: l.ttml,
					lrc: l.lrc,
				}))
			);
		}

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "song",
			objectId: song.id,
			type: "CREATE",
			new: toJson(song),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: song.id,
			eventType: "song.created",
			payload: { id: song.id },
		});

		return song;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: SongId,
		input: UpdateSongInput
	): Promise<Song> {
		const existing = await tx.orm.core.Song.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanUpdateSong(actor, existing);

		const { publishedAt, ...restUpdateData } = input;
		const updateData = {
			...restUpdateData,
			...(publishedAt !== undefined ? { publishedAt: toInstant(publishedAt) } : {}),
		};

		const updated = await tx.orm.core.Song.where({ id }).update(updateData);

		if (!updated) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "song",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: id,
			eventType: "song.updated",
			payload: { id, updatedFields: Object.keys(input) },
		});

		return updated;
	}

	private async deleteInTransaction(tx: TxClient, actor: Principal, id: SongId): Promise<void> {
		const existing = await tx.orm.core.Song.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanDeleteSong(actor, existing);

		const now = toInstant(new Date());
		await tx.orm.core.Song.where({ id }).update({ deletedAt: now });

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "song",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: id,
			eventType: "song.deleted",
			payload: { id },
		});
	}

	private async invalidateCache(id: SongId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:song:${id}:details`);
		}
	}
}
