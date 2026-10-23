import type { DatabaseClient, Lyrics, Song, SongExternalLink } from "@cvsa/db";
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

		const data = await this.db.orm.core.Song.where({ id, deletedAt: null })
			.include("performances", (perf) =>
				perf.include("singer").include("svsEngine").include("svsEngineVersion")
			)
			.include("creations", (cr) => cr.include("role").include("artist"))
			.include("lyrics", (lyr) => lyr.where({ deletedAt: null }))
			.include("externalLinks", (lnk) => lnk.where({ deletedAt: null }))
			.first();

		if (!data) {
			return null;
		}

		const { performances, creations, lyrics, externalLinks, ...song } = data;

		const details: SongDetails = {
			...song,
			singers: performances.map((item) => {
				const engineName = item.svsEngine?.name ?? "";
				const engineVersion = item.svsEngineVersion?.versionString ?? "";
				const engine = !engineName
					? null
					: !engineVersion
						? engineName
						: `${engineName} ${engineVersion}`;
				return {
					...item.singer,
					engine,
				};
			}),
			artists: creations.map((item) => ({
				...item.artist,
				role: item.role,
			})),
			lyrics,
			externalLinks,
		};

		if (this.cache) {
			await this.cache.set(cacheKey, details, 3600);
		}

		return details;
	}

	async getById(id: SongId): Promise<Song | null> {
		return this.db.orm.core.Song.where({ id, deletedAt: null }).first();
	}

	async listLyrics(songId: SongId): Promise<Lyrics[]> {
		return this.db.orm.core.Lyrics.where({ songId, deletedAt: null }).all();
	}

	async getLyricById(songId: SongId, lyricId: number): Promise<Lyrics | null> {
		return this.db.orm.core.Lyrics.where({ id: lyricId, songId, deletedAt: null }).first();
	}

	async getExternalLinkById(songId: SongId, linkId: number): Promise<SongExternalLink | null> {
		return this.db.orm.core.SongExternalLink.where({
			id: linkId,
			songId,
			deletedAt: null,
		}).first();
	}
}
