import {
	type DatabaseClient,
	type SvsEngine,
	type TxClient,
	history,
	svsEngine,
	Temporal,
	toJson,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { recordOutboxEvent } from "../outbox";
import {
	assertCanCreateEngine,
	assertCanDeleteEngine,
	assertCanUpdateEngine,
} from "./enginePolicy";
import type { CreateEngineInput, EngineId, UpdateEngineInput } from "./engineTypes";

export class EngineWriter {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async create(actor: Principal, input: CreateEngineInput): Promise<SvsEngine> {
		return this.db.transaction((tx) => this.createInTransaction(tx, actor, input));
	}

	async update(actor: Principal, id: EngineId, input: UpdateEngineInput): Promise<SvsEngine> {
		const updated = await this.db.transaction((tx) =>
			this.updateInTransaction(tx, actor, id, input)
		);
		await this.invalidateCache(id);
		return updated;
	}

	async delete(actor: Principal, id: EngineId): Promise<void> {
		await this.db.transaction((tx) => this.deleteInTransaction(tx, actor, id));
		await this.invalidateCache(id);
	}

	private async createInTransaction(
		tx: TxClient,
		actor: Principal,
		input: CreateEngineInput
	): Promise<SvsEngine> {
		assertCanCreateEngine(actor);

		const [created] = await tx
			.insert(svsEngine)
			.values({
				name: input.name,
				description: input.description,
				localizedDescriptions: input.localizedDescriptions
					? toJson(input.localizedDescriptions)
					: undefined,
			})
			.returning();
		if (!created) throw new Error("Failed to insert engine");

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "svs_engine",
			objectId: created.id,
			type: "CREATE",
			new: toJson(created),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "SvsEngine",
			aggregateId: created.id,
			eventType: "EngineCreated",
			payload: toJson(created),
		});

		return created;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: EngineId,
		input: UpdateEngineInput
	): Promise<SvsEngine> {
		assertCanUpdateEngine(actor);

		const [existing] = await tx
			.select()
			.from(svsEngine)
			.where(and(eq(svsEngine.id, id), isNull(svsEngine.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}

		const [updated] = await tx
			.update(svsEngine)
			.set({
				name: input.name,
				description: input.description,
				localizedDescriptions: input.localizedDescriptions
					? toJson(input.localizedDescriptions)
					: undefined,
			})
			.where(eq(svsEngine.id, id))
			.returning();

		if (!updated) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "svs_engine",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "SvsEngine",
			aggregateId: id,
			eventType: "EngineUpdated",
			payload: toJson(updated),
		});

		return updated;
	}

	private async deleteInTransaction(tx: TxClient, actor: Principal, id: EngineId): Promise<void> {
		assertCanDeleteEngine(actor);

		const [existing] = await tx
			.select()
			.from(svsEngine)
			.where(and(eq(svsEngine.id, id), isNull(svsEngine.deletedAt)))
			.limit(1);
		if (!existing) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}

		await tx
			.update(svsEngine)
			.set({ deletedAt: Temporal.Now.instant() })
			.where(eq(svsEngine.id, id));

		await tx.insert(history).values({
			userId: actor.auditUserId,
			table: "svs_engine",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await recordOutboxEvent(tx, {
			aggregateType: "SvsEngine",
			aggregateId: id,
			eventType: "EngineDeleted",
			payload: { id },
		});
	}

	private async invalidateCache(id: EngineId): Promise<void> {
		if (this.cache) {
			await this.cache.delete(`catalog:engine:details:${id}`);
		}
	}
}
