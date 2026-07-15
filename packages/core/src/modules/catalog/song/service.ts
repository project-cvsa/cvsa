import type { OutboxService } from "@cvsa/core/internal";
import { AppError, type IServiceWithGetDetails } from "@cvsa/core/internal";
import { prisma } from "@cvsa/db";
import type {
	SongDetailsResponseDto,
	SongId,
	CreateSongRequestDto,
	UpdateSongRequestDto,
	SongResponseDto,
	SongLyricsCreateRequestDto,
	SongLyricsUpdateRequestDto,
	SongLyricsResponseDto,
	SongLyricsListResponseDto,
	SongExternalLinkCreateRequestDto,
	SongExternalLinkUpdateRequestDto,
	SongExternalLinkResponseDto,
} from "./dto";
import type { ISongRepository } from "./repository.interface";

export class SongService implements IServiceWithGetDetails<SongDetailsResponseDto> {
	constructor(
		private readonly repository: ISongRepository,
		private readonly outbox: OutboxService
	) {}

	async getDetails(id: SongId) {
		const result = await this.repository.getDetailsById(id);
		if (result === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		return result;
	}

	async create(input: CreateSongRequestDto): Promise<SongResponseDto> {
		const { song, entry } = await prisma.$transaction(async (tx) => {
			const song = await this.repository.create(input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: song.id,
					eventType: "song.created",
				},
				tx
			);
			return { song, entry };
		});

		await this.outbox.enqueue(entry);
		return song;
	}

	async update(id: SongId, input: UpdateSongRequestDto): Promise<SongResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		const { song, entry } = await prisma.$transaction(async (tx) => {
			const song = await this.repository.update(id, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.updated",
				},
				tx
			);
			return { song, entry };
		});

		await this.outbox.enqueue(entry);
		return song;
	}

	async delete(id: SongId): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		const entry = await prisma.$transaction(async (tx) => {
			await this.repository.softDelete(id, tx);
			return await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.deleted",
				},
				tx
			);
		});

		await this.outbox.enqueue(entry);
	}

	async listLyrics(id: SongId): Promise<SongLyricsListResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		return this.repository.getLyricsBySongId(id);
	}

	async getLyric(id: SongId, lyricId: number): Promise<SongLyricsResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		const lyric = await this.repository.getLyricById(id, lyricId);
		if (lyric === null) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}
		return lyric;
	}

	async createLyric(
		id: SongId,
		input: SongLyricsCreateRequestDto
	): Promise<SongLyricsResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		const { lyric, entry } = await prisma.$transaction(async (tx) => {
			const lyric = await this.repository.createLyrics(id, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.lyric_created",
				},
				tx
			);
			return { lyric, entry };
		});

		await this.outbox.enqueue(entry);
		return lyric;
	}

	async updateLyric(
		id: SongId,
		lyricId: number,
		input: SongLyricsUpdateRequestDto
	): Promise<SongLyricsResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		const lyric = await this.repository.getLyricById(id, lyricId);
		if (lyric === null) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		const { lyric: updated, entry } = await prisma.$transaction(async (tx) => {
			const lyric = await this.repository.updateLyric(id, lyricId, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.lyric_updated",
				},
				tx
			);
			return { lyric, entry };
		});

		await this.outbox.enqueue(entry);
		return updated;
	}

	async deleteLyric(id: SongId, lyricId: number): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		const lyric = await this.repository.getLyricById(id, lyricId);
		if (lyric === null) {
			throw new AppError("error.lyric.notfound", "NOT_FOUND", 404);
		}

		const entry = await prisma.$transaction(async (tx) => {
			await this.repository.softDeleteLyric(id, lyricId, tx);
			return await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.lyric_deleted",
				},
				tx
			);
		});

		await this.outbox.enqueue(entry);
	}

	async createExternalLink(
		id: SongId,
		input: SongExternalLinkCreateRequestDto
	): Promise<SongExternalLinkResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}

		const { link, entry } = await prisma.$transaction(async (tx) => {
			const link = await this.repository.createExternalLink(id, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.external_link_created",
				},
				tx
			);
			return { link, entry };
		});

		await this.outbox.enqueue(entry);
		return link;
	}

	async updateExternalLink(
		id: SongId,
		linkId: number,
		input: SongExternalLinkUpdateRequestDto
	): Promise<SongExternalLinkResponseDto> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		const link = await this.repository.getExternalLinkById(id, linkId);
		if (link === null) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		const { link: updated, entry } = await prisma.$transaction(async (tx) => {
			const link = await this.repository.updateExternalLink(id, linkId, input, tx);
			const entry = await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.external_link_updated",
				},
				tx
			);
			return { link, entry };
		});

		await this.outbox.enqueue(entry);
		return updated;
	}

	async deleteExternalLink(id: SongId, linkId: number): Promise<void> {
		const existing = await this.repository.getById(id);
		if (existing === null) {
			throw new AppError("error.song.notfound", "NOT_FOUND", 404);
		}
		const link = await this.repository.getExternalLinkById(id, linkId);
		if (link === null) {
			throw new AppError("error.externalLink.notfound", "NOT_FOUND", 404);
		}

		const entry = await prisma.$transaction(async (tx) => {
			await this.repository.softDeleteExternalLink(id, linkId, tx);
			return await this.outbox.createEntry(
				{
					aggregateType: "song",
					aggregateId: id,
					eventType: "song.external_link_deleted",
				},
				tx
			);
		});

		await this.outbox.enqueue(entry);
	}
}
