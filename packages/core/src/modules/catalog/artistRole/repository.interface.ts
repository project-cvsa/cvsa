import type { TxClient } from "@cvsa/db";
import type { IRepositoryWithGetDetails } from "@cvsa/core/internal";
import type {
	CreateArtistRoleRequestDto,
	ArtistRoleId,
	UpdateArtistRoleRequestDto,
	ArtistRoleResponseDto,
	ArtistRoleDetailsResponseDto,
} from "./dto";

export abstract class IArtistRoleRepository
	implements IRepositoryWithGetDetails<ArtistRoleDetailsResponseDto>
{
	abstract getById(id: ArtistRoleId, tx?: TxClient): Promise<ArtistRoleResponseDto | null>;
	abstract getDetailsById(
		id: ArtistRoleId,
		tx?: TxClient
	): Promise<ArtistRoleDetailsResponseDto | null>;
	abstract create(
		input: CreateArtistRoleRequestDto,
		tx?: TxClient
	): Promise<ArtistRoleResponseDto>;
	abstract update(
		id: ArtistRoleId,
		input: UpdateArtistRoleRequestDto,
		tx?: TxClient
	): Promise<ArtistRoleResponseDto>;
	abstract softDelete(id: ArtistRoleId, tx?: TxClient): Promise<void>;
}
