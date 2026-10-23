import type { SvsEngine } from "@cvsa/db";
import type { EngineDetailsResponseDto } from "@cvsa/contracts";

export type EngineId = number;

export interface CreateEngineInput {
	name: string;
	description?: string;
	localizedDescriptions?: Record<string, string>;
}

export interface UpdateEngineInput {
	name?: string;
	description?: string;
	localizedDescriptions?: Record<string, string>;
}

export type EngineRecord = SvsEngine;
export type EngineDetails = EngineDetailsResponseDto;
