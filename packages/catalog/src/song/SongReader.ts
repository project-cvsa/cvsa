import {
	type DatabaseClient,
	type Lyrics,
	type Song,
	type SongExternalLink,
	lyrics,
	song,
	songExternalLink,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import type { ICatalogCache } from "../cache";
import type { SongDetails, SongId } from "./songTypes";

export class SongReader {
	constructor(
		private readonly db: DatabaseClient,
		private readonly cache?: ICatalogCache
	) {}

	async getDetails(id: SongId): Promise<SongDetails | null> {
		const cacheKey = `catalog:song:${id}:details`;
		if (this.cache) {
			const cached = await this.cache.get<SongDetails>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const data = await this.db.query.song.findFirst({
			where: {
				id,
				deletedAt: { isNull: true },
			},
			with: {
				performances: {
					with: {
						singer: true,
						svsEngine: true,
						svsEngineVersion: true,
					},
				},
				creations: {
					with: {
						artist: true,
						role: true,
					},
				},
				lyrics: {
					where: { deletedAt: { isNull: true } },
				},
				externalLinks: {
					where: { deletedAt: { isNull: true } },
				},
			},
		});

		if (!data) {
			return null;
		}

		const { performances, creations, lyrics: lyricRows, externalLinks, ...songFields } = data;

		const details: SongDetails = {
			...songFields,
			singers: performances.flatMap((item) => {
				if (!item.singer) return [];
				const engineName = item.svsEngine?.name ?? "";
				const engineVersion = item.svsEngineVersion?.versionString ?? "";
				const engine = !engineName
					? null
					: !engineVersion
						? engineName
						: `${engineName} ${engineVersion}`;
				return [
					{
						...item.singer,
						engine,
					},
				];
			}),
			artists: creations.flatMap((item) =>
				item.artist && item.role ? [{ ...item.artist, role: item.role }] : []
			),
			lyrics: lyricRows,
			externalLinks,
		};

		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}

		return details;
	}

	async getById(id: SongId): Promise<Song | null> {
		const [row] = await this.db
			.select()
			.from(song)
			.where(and(eq(song.id, id), isNull(song.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async listLyrics(songId: SongId): Promise<Lyrics[]> {
		return this.db
			.select()
			.from(lyrics)
			.where(and(eq(lyrics.songId, songId), isNull(lyrics.deletedAt)));
	}

	async getLyricById(songId: SongId, lyricId: number): Promise<Lyrics | null> {
		const [row] = await this.db
			.select()
			.from(lyrics)
			.where(and(eq(lyrics.id, lyricId), eq(lyrics.songId, songId), isNull(lyrics.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async getExternalLinkById(songId: SongId, linkId: number): Promise<SongExternalLink | null> {
		const [row] = await this.db
			.select()
			.from(songExternalLink)
			.where(
				and(
					eq(songExternalLink.id, linkId),
					eq(songExternalLink.songId, songId),
					isNull(songExternalLink.deletedAt)
				)
			)
			.limit(1);
		return row ?? null;
	}
}
