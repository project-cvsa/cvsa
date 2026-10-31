import {
	type DatabaseClient,
	type Singer,
	type TxClient,
	history,
	singer,
	Temporal,
	toJson,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { recordOutboxEvent } from "../outbox";
import {
	assertCanCreateSinger,
	assertCanDeleteSinger,
	assertCanUpdateSinger,
} from "./singerPolicy";
import type { CreateSingerInput, SingerId, UpdateSingerInput } from "./singerTypes";

export class SingerWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(actor: Principal, input: CreateSingerInput): Promise<Singer> {
		return this.db.transaction((tx) => this.createInTransaction(tx, actor, input));
	}

	async update(actor: Principal, id: SingerId, input: UpdateSingerInput): Promise<Singer> {
		const updated = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, id, input)
		);
		await this.invalidateCache(id);
		return updated;
	}

	async delete(actor: Principal, id: SingerId): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, id));
		await this.invalidateCache(id);
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		input: CreateSingerInput
	): Promise<Singer> {
		assertCanCreateSinger(actor);

		const [created] = await tx
			.insert(singer)
			.values({
				name: input.name,
				avatarUrl: input.avatarUrl,
				language: input.language ?? "zh",
				localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
				description: input.description,
				localizedDescriptions: input.localizedDescriptions
					? toJson(input.localizedDescriptions)
					: undefined,
			})
			.returning();
		if (!created) throw new Error("Failed to insert singer");

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "singer",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Singer",
			aggregateId: created.id,
			eventType: "SingerCreated",
			payload: toJson(created),
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: SingerId,
		input: UpdateSingerInput
	): Promise<Singer> {
		assertCanUpdateSinger(actor);

		const [existing] = await tx
			.select()
			.from(singer)
			.where(and(eq(singer.id, id), isNull(singer.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
		}

		const [updated] = await tx
			.update(singer)
			.set({
				name: input.name,
				avatarUrl: input.avatarUrl,
				language: input.language,
				localizedNames: input.localizedNames ? toJson(input.localizedNames) : undefined,
				description: input.description,
				localizedDescriptions: input.localizedDescriptions
					? toJson(input.localizedDescriptions)
					: undefined,
			})
			.where(eq(singer.id, id))
			.returning();

		if (!updated) {
			throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "singer",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Singer",
			aggregateId: id,
			eventType: "SingerUpdated",
			payload: toJson(updated),
		});

		return updated;
	}

	private async deleteInTransaction(tx: TxClient, actor: Principal, id: SingerId): Promise<void> {
		assertCanDeleteSinger(actor);

		const [existing] = await tx
			.select()
			.from(singer)
			.where(and(eq(singer.id, id), isNull(singer.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
		}

		await tx.update(singer).set({ deletedAt: Temporal.Now.instant() }).where(eq(singer.id, id));

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "singer",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "Singer",
			aggregateId: id,
			eventType: "SingerDeleted",
			payload: { id },
		});
	}

	private async invalidateCache(id: SingerId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:singer:details:${id}`);
		}
	}
}
