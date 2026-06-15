import type { PrismaClient } from "@cvsa/db";
import type { TxClient } from "@cvsa/db";
import { BaseRepository } from "../../../utils/BaseRepository";
import type {
	CreateEngineRequestDto,
	EngineId,
	UpdateEngineRequestDto,
	EngineDetailsResponseDto,
} from "./dto";
import type { IEngineRepository } from "./repository.interface";

export class EngineRepository extends BaseRepository implements IEngineRepository {
	constructor(private readonly prisma: PrismaClient) {
		super();
	}

	async getById(id: EngineId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.engine.getById", () =>
			client.svsEngine.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async getDetailsById(id: EngineId, tx?: TxClient): Promise<EngineDetailsResponseDto | null> {
		const client = tx ?? this.prisma;
		return this.query("db.engine.getDetailsById", () =>
			client.svsEngine.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async create(input: CreateEngineRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.engine.create", () =>
			client.svsEngine.create({
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async update(id: EngineId, input: UpdateEngineRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.engine.update", () =>
			client.svsEngine.update({
				where: { id },
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async softDelete(id: EngineId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		await this.query("db.engine.softDelete", () =>
			client.svsEngine.update({
				where: { id },
				data: { deletedAt: new Date() },
			})
		);
	}
}
