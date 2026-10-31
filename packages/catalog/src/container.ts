import { db } from "@cvsa/db";
import { env } from "@cvsa/env";
import { ArtistReader, ArtistWriter } from "./artist";
import { ArtistRoleReader, ArtistRoleWriter } from "./artistRole";
import { RedisCatalogCache } from "./cache";
import { EngineReader, EngineWriter } from "./engine";
import { SingerReader, SingerWriter } from "./singer";
import { SongExternalLinkWriter } from "./song/externalLinks/SongExternalLinkWriter";
import { SongLyricsWriter } from "./song/lyrics/SongLyricsWriter";
import { SongReader } from "./song/SongReader";
import { SongWriter } from "./song/SongWriter";

export const catalogCache = new RedisCatalogCache(env.REDIS_CACHE_URL ?? env.REDIS_URL);
export const songReader = new SongReader(db, catalogCache);
export const songWriter = new SongWriter(db, catalogCache);
export const songLyricsWriter = new SongLyricsWriter(db, catalogCache);
export const songExternalLinkWriter = new SongExternalLinkWriter(db, catalogCache);

export const artistReader = new ArtistReader(db, catalogCache);
export const artistWriter = new ArtistWriter(db, catalogCache);

export const singerReader = new SingerReader(db, catalogCache);
export const singerWriter = new SingerWriter(db, catalogCache);

export const artistRoleReader = new ArtistRoleReader(db, catalogCache);
export const artistRoleWriter = new ArtistRoleWriter(db, catalogCache);

export const engineReader = new EngineReader(db, catalogCache);
export const engineWriter = new EngineWriter(db, catalogCache);
