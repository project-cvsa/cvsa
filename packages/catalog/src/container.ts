import { prisma } from "@cvsa/db";
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

export const catalogCache = new RedisCatalogCache(env.REDIS_URL);
export const songReader = new SongReader(prisma, catalogCache);
export const songWriter = new SongWriter(prisma, catalogCache);
export const songLyricsWriter = new SongLyricsWriter(prisma, catalogCache);
export const songExternalLinkWriter = new SongExternalLinkWriter(prisma, catalogCache);

export const artistReader = new ArtistReader(prisma, catalogCache);
export const artistWriter = new ArtistWriter(prisma, catalogCache);

export const singerReader = new SingerReader(prisma, catalogCache);
export const singerWriter = new SingerWriter(prisma, catalogCache);

export const artistRoleReader = new ArtistRoleReader(prisma, catalogCache);
export const artistRoleWriter = new ArtistRoleWriter(prisma, catalogCache);

export const engineReader = new EngineReader(prisma, catalogCache);
export const engineWriter = new EngineWriter(prisma, catalogCache);
