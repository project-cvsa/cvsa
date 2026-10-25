import type { DatabaseClient, SongExternalLink, TxClient } from "@cvsa/db";
import { toJson, toInstant } from "@cvsa/db";
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

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		input: SongExternalLinkCreateInput
	): Promise<SongExternalLink> {
		const song = await tx.orm.core.Song.where({ id: songId, deletedAt: null }).first();
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanManageExternalLinks(actor, song);

		const link = await tx.orm.core.SongExternalLink.create({
			songId,
			label: input.label,
			url: input.url,
			platform: input.platform ?? undefined,
			platformId: input.platformId,
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "song_external_link",
			objectId: link.id,
			type: "CREATE",
			new: toJson(link),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "song",
			aggregateId: songId,
			eventType: "song.external_link_created",
			payload: { songId, linkId: link.id },
		});

		return link;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		songId: SongId,
		linkId: number,
		input: SongExternalLinkUpdateInput
	): Promise<SongExternalLink> {
		const song = await tx.orm.core.Song.where({ id: songId, deletedAt: null }).first();
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanManageExternalLinks(actor, song);

		const existing = await tx.orm.core.SongExternalLink.where({
			id: linkId,
			songId,
			deletedAt: null,
		}).first();
		if (!existing) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		const updated = await tx.orm.core.SongExternalLink.where({ id: linkId }).update({
			label: input.label,
			url: input.url,
			platform: input.platform ?? undefined,
			platformId: input.platformId,
		});
		if (!updated) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.meta.History.create({
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
		const song = await tx.orm.core.Song.where({ id: songId, deletedAt: null }).first();
		if (!song) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		assertCanManageExternalLinks(actor, song);

		const existing = await tx.orm.core.SongExternalLink.where({
			id: linkId,
			songId,
			deletedAt: null,
		}).first();
		if (!existing) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		const now = toInstant(new Date());
		await tx.orm.core.SongExternalLink.where({ id: linkId }).update({ deletedAt: now });

		await tx.orm.meta.History.create({
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
