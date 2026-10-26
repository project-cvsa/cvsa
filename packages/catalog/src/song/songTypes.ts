import type {
	Artist,
	ArtistRole,
	Lyrics,
	Platform,
	Singer,
	Song,
	SongExternalLink,
	SongType,
} from "@cvsa/db";

export type SongId = number;

export interface SingerInDetails extends Singer {
	readonly engine: string | null;
}

export interface ArtistInDetails extends Artist {
	readonly role: ArtistRole;
}

export interface SongDetails extends Song {
	readonly singers: readonly SingerInDetails[];
	readonly artists: readonly ArtistInDetails[];
	readonly lyrics: readonly Lyrics[];
	readonly externalLinks: readonly SongExternalLink[];
}

export interface CreatePerformanceInput {
	readonly singerId: number;
	readonly voicebankId?: number;
	readonly svsEngineId?: number;
	readonly svsEngineVersionId?: number;
}

export interface CreateCreationInput {
	readonly artistId: number;
	readonly roleId: number;
}

export interface CreateSongInput {
	readonly name?: string;
	readonly type?: SongType;
	readonly language?: string;
	readonly localizedNames?: Record<string, string>;
	readonly description?: string;
	readonly localizedDescriptions?: Record<string, string>;
	readonly duration?: number;
	readonly coverUrl?: string;
	readonly publishedAt?: Date | string;
	readonly performances?: readonly CreatePerformanceInput[];
	readonly creations?: readonly CreateCreationInput[];
	readonly lyrics?: readonly SongLyricsCreateInput[];
}

export interface UpdateSongInput {
	readonly name?: string;
	readonly type?: SongType;
	readonly duration?: number;
	readonly description?: string;
	readonly coverUrl?: string;
	readonly publishedAt?: Date | string;
}

export interface SongLyricsCreateInput {
	readonly language?: string;
	readonly isTranslated?: boolean;
	readonly plainText?: string;
	readonly ttml?: string;
	readonly lrc?: string;
}

export interface SongLyricsUpdateInput {
	readonly language?: string;
	readonly isTranslated?: boolean;
	readonly plainText?: string;
	readonly ttml?: string;
	readonly lrc?: string;
}

export interface SongExternalLinkCreateInput {
	readonly label?: string | null;
	readonly url: string;
	readonly platform?: Platform | null;
	readonly platformId?: string | null;
}

export interface SongExternalLinkUpdateInput {
	readonly label?: string | null;
	readonly url?: string;
	readonly platform?: Platform | null;
	readonly platformId?: string | null;
}
