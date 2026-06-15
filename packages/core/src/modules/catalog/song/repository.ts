import type { PrismaClient } from "@cvsa/db";
import type { TxClient } from "@cvsa/db";
import { BaseRepository } from "../../../utils/BaseRepository";
import type {
	CreateSongRequestDto,
	SongId,
	UpdateSongRequestDto,
	SongDetailsResponseDto,
	SongLyricsCreateRequestDto,
	SongLyricsUpdateRequestDto,
} from "./dto";
import type { ISongRepository } from "./repository.interface";

export class SongRepository extends BaseRepository implements ISongRepository {
	constructor(private readonly prisma: PrismaClient) {
		super();
	}

	async getById(id: SongId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		return this.query("db.song.getById", () =>
			client.song.findFirst({
				where: { id, deletedAt: null },
				omit: { deletedAt: true },
			})
		);
	}

	async getDetailsById(id: SongId, tx?: TxClient): Promise<SongDetailsResponseDto | null> {
		const client = tx ?? this.prisma;
		const data = await this.query("db.song.getDetailsById", () =>
			client.song.findFirst({
				where: { id, deletedAt: null },
				include: {
					performances: {
						include: {
							singer: true,
							svsEngine: true,
							svsEngineVersion: true,
						},
					},
					creations: {
						include: {
							role: true,
							artist: true,
						},
					},
					lyrics: {
						omit: {
							deletedAt: true,
						},
					},
				},
				omit: {
					deletedAt: true,
				},
			})
		);
		if (!data) return null;
		const { performances, creations, lyrics, ...song } = data;
		return {
			singers: performances.map((item) => {
				const engineName = item.svsEngine?.name ?? "";
				const engineVersion = item.svsEngineVersion?.versionString ?? "";
				const engine = (() => {
					if (!engineName) return null;
					if (!engineVersion) return engineName;
					return `${engineName} ${engineVersion}`;
				})();
				return {
					...item.singer,
					engine,
				};
			}),
			artists: creations.map((item) => {
				return {
					...item.artist,
					role: item.role,
				};
			}),
			lyrics: lyrics,
			...song,
		};
	}

	async create(input: CreateSongRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;
		const { performances, creations, lyrics, ...songData } = input;

		return this.query("db.song.create", () =>
			client.song.create({
				data: {
					...songData,
					performances: performances && {
						create: performances,
					},
					creations: creations && {
						create: creations.map((c) => ({
							artistId: c.artistId,
							artistRoleId: c.roleId,
						})),
					},
					lyrics: lyrics && {
						create: lyrics,
					},
				},
				omit: {
					deletedAt: true,
				},
			})
		);
	}

	async update(id: SongId, input: UpdateSongRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;

		return this.query("db.song.update", () =>
			client.song.update({
				where: { id },
				data: input,
				omit: {
					deletedAt: true,
				},
			})
		);
	}

	async softDelete(id: SongId, tx?: TxClient) {
		const client = tx ?? this.prisma;
		await this.query("db.song.softDelete", () =>
			client.song.update({
				where: { id },
				data: { deletedAt: new Date() },
			})
		);
	}

	async createLyrics(id: SongId, input: SongLyricsCreateRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;

		return this.query("db.song.createLyrics", () =>
			client.lyrics.create({
				data: {
					songId: id,
					...input,
				},
				omit: {
					deletedAt: true,
				},
			})
		);
	}

	async getLyricsBySongId(id: SongId, tx?: TxClient) {
		const client = tx ?? this.prisma;

		return this.query("db.song.getLyricsBySongId", () =>
			client.lyrics.findMany({
				where: { songId: id, deletedAt: null },
				omit: { deletedAt: true, songId: true },
			})
		);
	}

	async getLyricById(lyricId: number, tx?: TxClient) {
		const client = tx ?? this.prisma;

		return this.query("db.song.getLyricById", () =>
			client.lyrics.findFirst({
				where: { id: lyricId, deletedAt: null },
				omit: { deletedAt: true, songId: true },
			})
		);
	}

	async updateLyric(lyricId: number, input: SongLyricsUpdateRequestDto, tx?: TxClient) {
		const client = tx ?? this.prisma;

		return this.query("db.song.updateLyric", () =>
			client.lyrics.update({
				where: { id: lyricId },
				data: input,
				omit: { deletedAt: true, songId: true },
			})
		);
	}

	async softDeleteLyric(lyricId: number, tx?: TxClient) {
		const client = tx ?? this.prisma;

		await this.query("db.song.softDeleteLyric", () =>
			client.lyrics.update({
				where: { id: lyricId },
				data: { deletedAt: new Date() },
			})
		);
	}
}
