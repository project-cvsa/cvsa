import type { DatabaseClient, Lyrics, TxClient } from "@cvsa/db";
import { toJson, toInstant } from "@cvsa/db";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../../cache";
import { recordOutboxEvent } from "../../outbox";
import { assertCanManageLyrics } from "../songPolicy";
import type { SongId, SongLyricsCreateInput, SongLyricsUpdateInput } from "../songTypes";

export class SongLyricsWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(actor: Principal, songId: SongId, input: SongLyricsCreateInput): Promise<Lyrics> {
		const lyric = await this.db.transaction((tx) =>
			this.createInTransaction(tx, actor, songId, input)
		);
		await this.invalidateCache(songId);
		return lyric;
	}

	async update(
		actor: Principal,
		songId: SongId,
		lyricId: number,
		input: SongLyricsUpdateInput
	): Promise<Lyrics> {
		const lyric = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, songId, lyricId, input)
		);
		await this.invalidateCache(songId);
		return lyric;
	}

	async delete(actor: Principal, songId: SongId, lyricId: number): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, songId, lyricId));
		await this.invalidateCache(songId);
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		input: SongLyricsCreateInput
	): Promise<Lyrics> {
		const song = await tx.orm.core.Song.where({ id: songId, deletedAt: null }).first();
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanManageLyrics(actor, song);

		const lyric = await tx.orm.core.Lyrics.create({
			songId,
			...input,
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "lyrics",
			objectId: lyric.id,
			type: "CREATE",
			new: toJson(lyric),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.lyric_created",
			payload: { songId, lyricId: lyric.id },
		});

		return lyric;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		lyricId: number,
		input: SongLyricsUpdateInput
	): Promise<Lyrics> {
		const song = await tx.orm.core.Song.where({ id: songId, deletedAt: null }).first();
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanManageLyrics(actor, song);

		const existing = await tx.orm.core.Lyrics.where({
			id: lyricId,
			songId,
			deletedAt: null,
		}).first();
		if (!existing) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		const updated = await tx.orm.core.Lyrics.where({ id: lyricId }).update(input);
		if (!updated) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "lyrics",
			objectId: lyricId,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.lyric_updated",
			payload: { songId, lyricId },
		});

		return updated;
	}

	private async deleteInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		lyricId: number
	): Promise<void> {
		const song = await tx.orm.core.Song.where({ id: songId, deletedAt: null }).first();
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanManageLyrics(actor, song);

		const existing = await tx.orm.core.Lyrics.where({
			id: lyricId,
			songId,
			deletedAt: null,
		}).first();
		if (!existing) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		const now = toInstant(new Date());
		await tx.orm.core.Lyrics.where({ id: lyricId }).update({ deletedAt: now });

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "lyrics",
			objectId: lyricId,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.lyric_deleted",
			payload: { songId, lyricId },
		});
	}

	private async invalidateCache(songId: SongId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:song:${songId}:details`);
		}
	}
}
