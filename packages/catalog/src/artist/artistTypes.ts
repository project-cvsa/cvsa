import type { Artist } from "@cvsa/db";
import type { ArtistDetailsResponseDto } from "@cvsa/contracts";

export type ArtistId = number;

export interface CreateArtistInput {
	name?: string;
	localizedNames?: Record<string, string>;
	language?: string;
	aliases?: string[];
	description?: string;
	localizedDescriptions?: Record<string, string>;
	userId?: string;
}

export interface UpdateArtistInput {
	name?: string;
	localizedNames?: Record<string, string>;
	language?: string;
	aliases?: string[];
	description?: string;
	localizedDescriptions?: Record<string, string>;
	userId?: string;
}

export type ArtistRecord = Artist;
export type ArtistDetails = ArtistDetailsResponseDto;
