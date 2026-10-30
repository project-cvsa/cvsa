import {
	type DatabaseClient,
	type Lyrics,
	type TxClient,
	history,
	lyrics,
	song,
	toInstant,
	toJson,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
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

	private async requireSong(tx: TxClient, songId: SongId) {
		const [row] = await tx
			.select()
			.from(song)
			.where(and(eq(song.id, songId), isNull(song.deletedAt)))
			.limit(1);
		if (!row) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		return row;
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		input: SongLyricsCreateInput
	): Promise<Lyrics> {
		const songRow = await this.requireSong(tx, songId);
		assertCanManageLyrics(actor, songRow);

		const [created] = await tx
			.insert(lyrics)
			.values({
				songId,
				...input,
			})
			.returning();
		if (!created) throw new Error("Failed to insert lyrics");

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "lyrics",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.lyric_created",
			payload: { songId, lyricId: created.id },
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		lyricId: number,
		input: SongLyricsUpdateInput
	): Promise<Lyrics> {
		const songRow = await this.requireSong(tx, songId);
		assertCanManageLyrics(actor, songRow);

		const [existing] = await tx
			.select()
			.from(lyrics)
			.where(and(eq(lyrics.id, lyricId), eq(lyrics.songId, songId), isNull(lyrics.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		const [updated] = await tx
			.update(lyrics)
			.set(input)
			.where(eq(lyrics.id, lyricId))
			.returning();
		if (!updated) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
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
		const songRow = await this.requireSong(tx, songId);
		assertCanManageLyrics(actor, songRow);

		const [existing] = await tx
			.select()
			.from(lyrics)
			.where(and(eq(lyrics.id, lyricId), eq(lyrics.songId, songId), isNull(lyrics.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		await tx
			.update(lyrics)
			.set({ deletedAt: toInstant(new Date()) })
			.where(eq(lyrics.id, lyricId));

		await tx.insert(history).values({
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
