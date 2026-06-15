import type { OutboxService } from "../../outbox/service";
import { AppError } from "../../../error/AppError";
import type { IServiceWithGetDetails } from "../../../types/service";
import { prisma } from "@cvsa/db";
import type {
	ArtistRoleDetailsResponseDto,
	ArtistRoleId,
	CreateArtistRoleRequestDto,
	UpdateArtistRoleRequestDto,
	ArtistRoleResponseDto,
} from "./dto";
import type { IArtistRoleRepository } from "./repository.interface";

export class ArtistRoleService implements IServiceWithGetDetails<ArtistRoleDetailsResponseDto> {
	constructor(
		private readonly repository: IArtistRoleRepository,
		private readonly outbox: OutboxService
	) {}

	async getDetails(id: ArtistRoleId) {
		const result = await this.repository.getDetailsById(id);
		if (result === null) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}
		return result;
	}

	async create(input: CreateArtistRoleRequestDto): Promise<ArtistRoleResponseDto> {
		const { role, entry } = await prisma.$transaction(async (tx) => {
			const role = await this.repository.create(input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "artistRole",
					aggregateId: role.id,
					eventType: "artistRole.created",
				},
				tx
			);
			return { role, entry };
		});

		await this.outbox.enqueue(entry);
		return role;
	}

	async update(
		id: ArtistRoleId,
		input: UpdateArtistRoleRequestDto
	): Promise<ArtistRoleResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		const { role, entry } = await prisma.$transaction(async (tx) => {
			const role = await this.repository.update(id, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "artistRole",
					aggregateId: id,
					eventType: "artistRole.updated",
				},
				tx
			);
			return { role, entry };
		});

		await this.outbox.enqueue(entry);
		return role;
	}

	async delete(id: ArtistRoleId): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.artistRole.notfound", "NOT_FOUND", 404);
		}

		const entry = await prisma.$transaction(async (tx) => {
			await this.repository.softDelete(id, tx);
			return await this.outbox.createEntry(
				{
					aggregateType: "artistRole",
					aggregateId: id,
					eventType: "artistRole.deleted",
				},
				tx
			);
		});

		await this.outbox.enqueue(entry);
	}
}
