import type { DatabaseClient, SvsEngine, TxClient } from "@cvsa/db";
import { Temporal, toJson } from "@cvsa/db";
import type { Principal } from "@cvsa/authentication";
import { AppError } from "@cvsa/contracts";
import type { ICatalogCache } from "../cache";
import { CatalogOutbox } from "../outbox";
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

		const engine = await tx.orm.core.SvsEngine.create({
			name: input.name,
			description: input.description,
			localizedDescriptions: input.localizedDescriptions
				? toJson(input.localizedDescriptions)
				: undefined,
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "svs_engine",
			objectId: engine.id,
			type: "CREATE",
			new: toJson(engine),
		});

		await CatalogOutbox.recordEvent(tx, {
			aggregateType: "SvsEngine",
			aggregateId: engine.id,
			eventType: "EngineCreated",
			payload: toJson(engine),
		});

		return engine;
	}

	private async updateInTransaction(
		tx: TxClient,
		actor: Principal,
		id: EngineId,
		input: UpdateEngineInput
	): Promise<SvsEngine> {
		assertCanUpdateEngine(actor);

		const existing = await tx.orm.core.SvsEngine.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}

		const updated = await tx.orm.core.SvsEngine.where({ id }).update({
			name: input.name,
			description: input.description,
			localizedDescriptions: input.localizedDescriptions
				? toJson(input.localizedDescriptions)
				: undefined,
		});

		if (!updated) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "svs_engine",
			objectId: id,
			type: "UPDATE",
			old: toJson(existing),
			new: toJson(updated),
		});

		await CatalogOutbox.recordEvent(tx, {
			aggregateType: "SvsEngine",
			aggregateId: id,
			eventType: "EngineUpdated",
			payload: toJson(updated),
		});

		return updated;
	}

	private async deleteInTransaction(tx: TxClient, actor: Principal, id: EngineId): Promise<void> {
		assertCanDeleteEngine(actor);

		const existing = await tx.orm.core.SvsEngine.where({ id, deletedAt: null }).first();
		if (!existing) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}

		await tx.orm.core.SvsEngine.where({ id }).update({
			deletedAt: Temporal.Now.instant(),
		});

		await tx.orm.meta.History.create({
			userId: actor.auditUserId,
			table: "svs_engine",
			objectId: id,
			type: "DELETE",
			old: toJson(existing),
		});

		await CatalogOutbox.recordEvent(tx, {
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
