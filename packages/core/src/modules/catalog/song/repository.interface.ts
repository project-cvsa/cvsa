import type { TxClient } from "@cvsa/db";
import type { IRepositoryWithGetDetails } from "@cvsa/core/internal";
import type {
	CreateSongRequestDto,
	SongId,
	UpdateSongRequestDto,
	SongDetailsResponseDto,
	SongResponseDto,
	SongLyricsCreateRequestDto,
	SongLyricsUpdateRequestDto,
	SongLyricsResponseDto,
	SongLyricsListResponseDto,
} from "./dto";

export abstract class ISongRepository implements IRepositoryWithGetDetails<SongDetailsResponseDto> {
	abstract getById(id: SongId, tx?: TxClient): Promise<SongResponseDto | null>;
	abstract getDetailsById(id: SongId, tx?: TxClient): Promise<SongDetailsResponseDto | null>;
	abstract create(input: CreateSongRequestDto, tx?: TxClient): Promise<SongResponseDto>;
	abstract update(
		id: SongId,
		input: UpdateSongRequestDto,
		tx?: TxClient
	): Promise<SongResponseDto>;
	abstract softDelete(id: SongId, tx?: TxClient): Promise<void>;
	abstract createLyrics(
		id: SongId,
		input: SongLyricsCreateRequestDto,
		tx?: TxClient
	): Promise<SongLyricsResponseDto>;
	abstract getLyricsBySongId(id: SongId, tx?: TxClient): Promise<SongLyricsListResponseDto>;
	abstract getLyricById(lyricId: number, tx?: TxClient): Promise<SongLyricsResponseDto | null>;
	abstract updateLyric(
		lyricId: number,
		input: SongLyricsUpdateRequestDto,
		tx?: TxClient
	): Promise<SongLyricsResponseDto>;
	abstract softDeleteLyric(lyricId: number, tx?: TxClient): Promise<void>;
}
