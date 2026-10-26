import type { ArtistRole } from "@cvsa/db";
import type { ArtistRoleDetailsResponseDto } from "@cvsa/contracts";

export type ArtistRoleId = number;

export interface CreateArtistRoleInput {
	name: string;
	language?: string;
	localizedNames?: Record<string, string>;
}

export interface UpdateArtistRoleInput {
	name?: string;
	language?: string;
	localizedNames?: Record<string, string>;
}

export type ArtistRoleRecord = ArtistRole;
export type ArtistRoleDetails = ArtistRoleDetailsResponseDto;
