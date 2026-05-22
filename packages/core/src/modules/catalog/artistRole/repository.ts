import type { PrismaClient } from "@cvsa/db";
import type { TxClient } from "@cvsa/db";
import { BaseRepository } from "../../../utils/BaseRepository";
import type {
	CreateArtistRoleRequestDto,
	ArtistRoleId,
	UpdateArtistRoleRequestDto,
	ArtistRoleDetailsResponseDto,
} from "./dto";
import type { IArtistRoleRepository } from "./repository.interface";

export class ArtistRoleRepository extends BaseRepository implements IArtistRoleRepository {
	constructor(private readonly prisma: PrismaClient) {
		super();
	}

	async getById(id: ArtistRoleId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.artistRole.getById", () =>
			client.artistRole.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async getDetailsById(
		id: ArtistRoleId,
		tx?: TxClient
	): Promise<ArtistRoleDetailsResponseDto | null> {
		const client = tx ?? this.prisma;
		return this.query("db.artistRole.getDetailsById", () =>
			client.artistRole.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async create(input: CreateArtistRoleRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.artistRole.create", () =>
			client.artistRole.create({
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async update(id: ArtistRoleId, input: UpdateArtistRoleRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.artistRole.update", () =>
			client.artistRole.update({
				where: { id },
				data: input,
				omit: { deletedAt: true },
			})
		);
	}

	async softDelete(id: ArtistRoleId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		await this.query("db.artistRole.softDelete", () =>
			client.artistRole.update({
				where: { id },
				data: { deletedAt: new Date() },
			})
		);
	}
}
