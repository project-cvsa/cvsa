import type { OutboxService } from "../../outbox/service";
import { AppError } from "../../../error/AppError";
import type { IServiceWithGetDetails } from "../../../types/service";
import { prisma } from "@cvsa/db";
import type {
	ArtistDetailsResponseDto,
	ArtistId,
	CreateArtistRequestDto,
	UpdateArtistRequestDto,
	ArtistResponseDto,
} from "./dto";
import type { IArtistRepository } from "./repository.interface";

export class ArtistService implements IServiceWithGetDetails<ArtistDetailsResponseDto> {
	constructor(
		private readonly repository: IArtistRepository,
		private readonly outbox: OutboxService
	) {}

	async getDetails(id: ArtistId) {
		const result = await this.repository.getDetailsById(id);
		if (result === null) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}
		return result;
	}

	async create(input: CreateArtistRequestDto): Promise<ArtistResponseDto> {
		const { artist, entry } = await prisma.$transaction(async (tx) => {
			const artist = await this.repository.create(input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "artist",
					aggregateId: artist.id,
					eventType: "artist.created",
				},
				tx
			);
			return { artist, entry };
		});

		await this.outbox.enqueue(entry);
		return artist;
	}

	async update(id: ArtistId, input: UpdateArtistRequestDto): Promise<ArtistResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		const { artist, entry } = await prisma.$transaction(async (tx) => {
			const artist = await this.repository.update(id, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "artist",
					aggregateId: id,
					eventType: "artist.updated",
				},
				tx
			);
			return { artist, entry };
		});

		await this.outbox.enqueue(entry);
		return artist;
	}

	async delete(id: ArtistId): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.artist.notfound", "NOT_FOUND", 404);
		}

		const entry = await prisma.$transaction(async (tx) => {
			await this.repository.softDelete(id, tx);
			return await this.outbox.createEntry(
				{
					aggregateType: "artist",
					aggregateId: id,
					eventType: "artist.deleted",
				},
				tx
			);
		});

		await this.outbox.enqueue(entry);
	}
}
