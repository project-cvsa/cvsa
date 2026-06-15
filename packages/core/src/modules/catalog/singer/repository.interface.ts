import type { TxClient } from "@cvsa/db";
import type { IRepositoryWithGetDetails } from "@cvsa/core/internal";
import type {
	CreateSingerRequestDto,
	SingerId,
	UpdateSingerRequestDto,
	SingerResponseDto,
	SingerDetailsResponseDto,
} from "./dto";

export abstract class ISingerRepository
	implements IRepositoryWithGetDetails<SingerDetailsResponseDto>
{
	abstract getById(id: SingerId, tx?: TxClient): Promise<SingerResponseDto | null>;
	abstract getDetailsById(id: SingerId, tx?: TxClient): Promise<SingerDetailsResponseDto | null>;
	abstract create(input: CreateSingerRequestDto, tx?: TxClient): Promise<SingerResponseDto>;
	abstract update(
		id: SingerId,
		input: UpdateSingerRequestDto,
		tx?: TxClient
	): Promise<SingerResponseDto>;
	abstract softDelete(id: SingerId, tx?: TxClient): Promise<void>;
}
