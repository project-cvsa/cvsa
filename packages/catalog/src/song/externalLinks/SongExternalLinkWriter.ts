import {
	type DatabaseClient,
	type SongExternalLink,
	type TxClient,
	history,
	song,
	songExternalLink,
	toInstant,
	toJson,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../../cache";
import { recordOutboxEvent } from "../../outbox";
import { assertCanManageExternalLinks } from "../songPolicy";
import type {
	SongExternalLinkCreateInput,
	SongExternalLinkUpdateInput,
	SongId,
} from "../songTypes";

export class SongExternalLinkWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(
		actor: Principal,
		songId: SongId,
		input: SongExternalLinkCreateInput
	): Promise<SongExternalLink> {
		const link = await this.db.transaction((tx) =>
			this.createInTransaction(tx, actor, songId, input)
		);
		await this.invalidateCache(songId);
		return link;
	}

	async update(
		actor: Principal,
		songId: SongId,
		linkId: number,
		input: SongExternalLinkUpdateInput
	): Promise<SongExternalLink> {
		const link = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, songId, linkId, input)
		);
		await this.invalidateCache(songId);
		return link;
	}

	async delete(actor: Principal, songId: SongId, linkId: number): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, songId, linkId));
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
		input: SongExternalLinkCreateInput
	): Promise<SongExternalLink> {
		const songRow = await this.requireSong(tx, songId);
		assertCanManageExternalLinks(actor, songRow);

		const [created] = await tx
			.insert(songExternalLink)
			.values({
				songId,
				label: input.label,
				url: input.url,
				platform: input.platform ?? undefined,
				platformId: input.platformId,
			})
			.returning();
		if (!created) throw new Error("Failed to insert external link");

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "song_external_link",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.external_link_created",
			payload: { songId, linkId: created.id },
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		linkId: number,
		input: SongExternalLinkUpdateInput
	): Promise<SongExternalLink> {
		const songRow = await this.requireSong(tx, songId);
		assertCanManageExternalLinks(actor, songRow);

		const [existing] = await tx
			.select()
			.from(songExternalLink)
			.where(
				and(
					eq(songExternalLink.id, linkId),
					eq(songExternalLink.songId, songId),
					isNull(songExternalLink.deletedAt)
				)
			)
			.limit(1);
		if (!existing) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		const [updated] = await tx
			.update(songExternalLink)
			.set({
				label: input.label,
				url: input.url,
				platform: input.platform ?? undefined,
				platformId: input.platformId,
			})
			.where(eq(songExternalLink.id, linkId))
			.returning();
		if (!updated) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "song_external_link",
			objectId: linkId,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.external_link_updated",
			payload: { songId, linkId },
		});

		return updated;
	}

	private async deleteInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		linkId: number
	): Promise<void> {
		const songRow = await this.requireSong(tx, songId);
		assertCanManageExternalLinks(actor, songRow);

		const [existing] = await tx
			.select()
			.from(songExternalLink)
			.where(
				and(
					eq(songExternalLink.id, linkId),
					eq(songExternalLink.songId, songId),
					isNull(songExternalLink.deletedAt)
				)
			)
			.limit(1);
		if (!existing) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		await tx
			.update(songExternalLink)
			.set({ deletedAt: toInstant(new Date()) })
			.where(eq(songExternalLink.id, linkId));

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "song_external_link",
			objectId: linkId,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.external_link_deleted",
			payload: { songId, linkId },
		});
	}

	private async invalidateCache(songId: SongId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:song:${songId}:details`);
		}
	}
}
