import type { TxClient } from "@cvsa/db";
import type { IRepositoryWithGetDetails } from "@cvsa/core/internal";
import type {
	CreateArtistRequestDto,
	ArtistId,
	UpdateArtistRequestDto,
	ArtistResponseDto,
	ArtistDetailsResponseDto,
} from "./dto";

export abstract class IArtistRepository
	implements IRepositoryWithGetDetails<ArtistDetailsResponseDto>
{
	abstract getById(id: ArtistId, tx?: TxClient): Promise<ArtistResponseDto | null>;
	abstract getDetailsById(id: ArtistId, tx?: TxClient): Promise<ArtistDetailsResponseDto | null>;
	abstract create(input: CreateArtistRequestDto, tx?: TxClient): Promise<ArtistResponseDto>;
	abstract update(
		id: ArtistId,
		input: UpdateArtistRequestDto,
		tx?: TxClient
	): Promise<ArtistResponseDto>;
	abstract softDelete(id: ArtistId, tx?: TxClient): Promise<void>;
}
