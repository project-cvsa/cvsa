import type { Singer } from "@cvsa/db";
import type { SingerDetailsResponseDto } from "@cvsa/contracts";

export type SingerId = number;

export interface CreateSingerInput {
	name?: string;
	avatarUrl?: string;
	language?: string;
	localizedNames?: Record<string, string>;
	description?: string;
	localizedDescriptions?: Record<string, string>;
}

export interface UpdateSingerInput {
	name?: string;
	avatarUrl?: string;
	language?: string;
	localizedNames?: Record<string, string>;
	description?: string;
	localizedDescriptions?: Record<string, string>;
}

export type SingerRecord = Singer;
export type SingerDetails = SingerDetailsResponseDto;
