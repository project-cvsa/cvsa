import {
	type DatabaseClient,
	type Song,
	type TxClient,
	history,
	lyrics,
	performance,
	creation,
	song,
	toInstant,
	toJson,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
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

		const {
			performances,
			creations,
			lyrics: lyricInputs,
			publishedAt,
			...restSongData
		} = input;

		const [created] = await tx
			.insert(song)
			.values({
				...restSongData,
				...(publishedAt !== undefined ? { publishedAt: toInstant(publishedAt) } : {}),
			})
			.returning();
		if (!created) throw new Error("Failed to insert song");

		if (performances && performances.length > 0) {
			await tx.insert(performance).values(
				performances.map((p) => ({
					songId: created.id,
					singerId: p.singerId,
					voicebankId: p.voicebankId,
					svsEngineId: p.svsEngineId,
					svsEngineVersionId: p.svsEngineVersionId,
				}))
			);
		}

		if (creations && creations.length > 0) {
			await tx.insert(creation).values(
				creations.map((c) => ({
					songId: created.id,
					artistId: c.artistId,
					artistRoleId: c.roleId,
				}))
			);
		}

		if (lyricInputs && lyricInputs.length > 0) {
			await tx.insert(lyrics).values(
				lyricInputs.map((l) => ({
					songId: created.id,
					language: l.language,
					isTranslated: l.isTranslated,
					plainText: l.plainText,
					ttml: l.ttml,
					lrc: l.lrc,
				}))
			);
		}

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "song",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: created.id,
			eventType: "song.created",
			payload: { id: created.id },
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: SongId,
		input: UpdateSongInput
	): Promise<Song> {
		const [existing] = await tx
			.select()
			.from(song)
			.where(and(eq(song.id, id), isNull(song.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanUpdateSong(actor, existing);

		const { publishedAt, ...restUpdateData } = input;
		const updateData = {
			...restUpdateData,
			...(publishedAt !== undefined ? { publishedAt: toInstant(publishedAt) } : {}),
		};

		const [updated] = await tx.update(song).set(updateData).where(eq(song.id, id)).returning();

		if (!updated) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
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
		const [existing] = await tx
			.select()
			.from(song)
			.where(and(eq(song.id, id), isNull(song.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanDeleteSong(actor, existing);

		const now = toInstant(new Date());
		await tx.update(song).set({ deletedAt: now }).where(eq(song.id, id));

		await tx.insert(history).values({
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
