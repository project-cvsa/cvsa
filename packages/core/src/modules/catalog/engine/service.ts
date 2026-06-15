import { AppError } from "../../../error/AppError";
import type { IServiceWithGetDetails } from "../../../types/service";
import type {
	EngineDetailsResponseDto,
	EngineId,
	CreateEngineRequestDto,
	UpdateEngineRequestDto,
	EngineResponseDto,
} from "./dto";
import type { IEngineRepository } from "./repository.interface";
import { traceTask } from "@cvsa/observability";

export class EngineService implements IServiceWithGetDetails<EngineDetailsResponseDto> {
	constructor(private readonly repository: IEngineRepository) {}

	async getDetails(id: EngineId) {
		return traceTask("db findOne engine", async () => {
			const result = await this.repository.getDetailsById(id);
			if (result === null) {
				throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
			}
			return result;
		});
	}

	async create(input: CreateEngineRequestDto): Promise<EngineResponseDto> {
		return traceTask("db create engine", async () => {
			return await this.repository.create(input);
		});
	}

	async update(id: EngineId, input: UpdateEngineRequestDto): Promise<EngineResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}
		return traceTask("db update engine", async () => {
			return await this.repository.update(id, input);
		});
	}

	async delete(id: EngineId): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.engine.notfound", "NOT_FOUND", 404);
		}
		await traceTask("db delete engine", async () => {
			return await this.repository.softDelete(id);
		});
	}
}
