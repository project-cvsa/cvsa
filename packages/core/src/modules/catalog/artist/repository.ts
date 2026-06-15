import type { PrismaClient } from "@cvsa/db";
import type { TxClient } from "@cvsa/db";
import { BaseRepository } from "../../../utils/BaseRepository";
import type {
	CreateArtistRequestDto,
	ArtistId,
	UpdateArtistRequestDto,
	ArtistDetailsResponseDto,
} from "./dto";
import type { IArtistRepository } from "./repository.interface";

export class ArtistRepository extends BaseRepository implements IArtistRepository {
	constructor(private readonly prisma: PrismaClient) {
		super();
	}

	async getById(id: ArtistId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.artist.getById", () =>
			client.artist.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async getDetailsById(id: ArtistId, tx?: TxClient): Promise<ArtistDetailsResponseDto | null> {
		const client = tx ?? this.prisma;
		return this.query("db.artist.getDetailsById", () =>
			client.artist.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async create(input: CreateArtistRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.artist.create", () =>
			client.artist.create({
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async update(id: ArtistId, input: UpdateArtistRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.artist.update", () =>
			client.artist.update({
				where: { id },
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async softDelete(id: ArtistId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		await this.query("db.artist.softDelete", () =>
			client.artist.update({
				where: { id },
				data: { deletedAt: new Date() },
			})
		);
	}
}
