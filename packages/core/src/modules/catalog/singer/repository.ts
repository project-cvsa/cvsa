import type { PrismaClient } from "@cvsa/db";
import type { TxClient } from "@cvsa/db";
import { BaseRepository } from "../../../utils/BaseRepository";
import type {
	CreateSingerRequestDto,
	SingerId,
	UpdateSingerRequestDto,
	SingerDetailsResponseDto,
} from "./dto";
import type { ISingerRepository } from "./repository.interface";

export class SingerRepository extends BaseRepository implements ISingerRepository {
	constructor(private readonly prisma: PrismaClient) {
		super();
	}

	async getById(id: SingerId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.singer.getById", () =>
			client.singer.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async getDetailsById(id: SingerId, tx?: TxClient): Promise<SingerDetailsResponseDto | null> {
		const client = tx ?? this.prisma;
		return this.query("db.singer.getDetailsById", () =>
			client.singer.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async create(input: CreateSingerRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.singer.create", () =>
			client.singer.create({
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async update(id: SingerId, input: UpdateSingerRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.singer.update", () =>
			client.singer.update({
				where: { id },
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async softDelete(id: SingerId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		await this.query("db.singer.softDelete", () =>
			client.singer.update({
				where: { id },
				data: { deletedAt: new Date() },
			})
		);
	}
}
