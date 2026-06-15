import type { TxClient } from "@cvsa/db";
import type { IRepositoryWithGetDetails } from "@cvsa/core/internal";
import type {
	CreateEngineRequestDto,
	EngineId,
	UpdateEngineRequestDto,
	EngineResponseDto,
	EngineDetailsResponseDto,
} from "./dto";

export abstract class IEngineRepository
	implements IRepositoryWithGetDetails<EngineDetailsResponseDto>
{
	abstract getById(id: EngineId, tx?: TxClient): Promise<EngineResponseDto | null>;
	abstract getDetailsById(id: EngineId, tx?: TxClient): Promise<EngineDetailsResponseDto | null>;
	abstract create(input: CreateEngineRequestDto, tx?: TxClient): Promise<EngineResponseDto>;
	abstract update(
		id: EngineId,
		input: UpdateEngineRequestDto,
		tx?: TxClient
	): Promise<EngineResponseDto>;
	abstract softDelete(id: EngineId, tx?: TxClient): Promise<void>;
}
