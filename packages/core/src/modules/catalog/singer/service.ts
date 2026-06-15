import type { OutboxService } from "../../outbox/service";
import { AppError } from "../../../error/AppError";
import type { IServiceWithGetDetails } from "../../../types/service";
import { prisma } from "@cvsa/db";
import type {
	SingerDetailsResponseDto,
	SingerId,
	CreateSingerRequestDto,
	UpdateSingerRequestDto,
	SingerResponseDto,
} from "./dto";
import type { ISingerRepository } from "./repository.interface";

export class SingerService implements IServiceWithGetDetails<SingerDetailsResponseDto> {
	constructor(
		private readonly repository: ISingerRepository,
		private readonly outbox: OutboxService
	) {}

	async getDetails(id: SingerId) {
		const result = await this.repository.getDetailsById(id);
		if (result === null) {
			throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
		}
		return result;
	}

	async create(input: CreateSingerRequestDto): Promise<SingerResponseDto> {
		const { singer, entry } = await prisma.$transaction(async (tx) => {
			const singer = await this.repository.create(input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "singer",
					aggregateId: singer.id,
					eventType: "singer.created",
				},
				tx
			);
			return { singer, entry };
		});

		await this.outbox.enqueue(entry);
		return singer;
	}

	async update(id: SingerId, input: UpdateSingerRequestDto): Promise<SingerResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
		}

		const { singer, entry } = await prisma.$transaction(async (tx) => {
			const singer = await this.repository.update(id, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "singer",
					aggregateId: id,
					eventType: "singer.updated",
				},
				tx
			);
			return { singer, entry };
		});

		await this.outbox.enqueue(entry);
		return singer;
	}

	async delete(id: SingerId): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.singer.notfound", "NOT_FOUND", 404);
		}

		const entry = await prisma.$transaction(async (tx) => {
			await this.repository.softDelete(id, tx);
			return await this.outbox.createEntry(
				{
					aggregateType: "singer",
					aggregateId: id,
					eventType: "singer.deleted",
				},
				tx
			);
		});

		await this.outbox.enqueue(entry);
	}
}
