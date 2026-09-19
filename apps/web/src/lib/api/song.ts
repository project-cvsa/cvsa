/**
 * Song endpoints (`/song`).
 *
 * Path parameters ride in the call — `eden.v2.song({ id })` — because Eden
 * turns a `:id` segment into a one-argument function in its proxy tree.
 */
import type {
	SongLyricsCreateRequestDto,
	SongLyricsResponseDto,
	SongLyricsUpdateRequestDto,
	SongResponseDto,
	UpdateSongRequestDto,
} from "@cvsa/core";
import type { ApiResult } from "./result";
import { getEdenClient, settle } from "./treaty";

/**
 * Update a song's own metadata. Relations the endpoint does not accept
 * (performances, creations, lyrics, external links) are edited elsewhere.
 */
async function update(
	id: number,
	body: UpdateSongRequestDto
): Promise<ApiResult<SongResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.song({ id }).patch(body));
}

async function createLyric(
	id: number,
	body: SongLyricsCreateRequestDto
): Promise<ApiResult<SongLyricsResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.song({ id }).lyric.post(body));
}

async function updateLyric(
	id: number,
	lyricId: number,
	body: SongLyricsUpdateRequestDto
): Promise<ApiResult<SongLyricsResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.song({ id }).lyric({ lyricId }).patch(body));
}

export const songApi = {
	update,
	createLyric,
	updateLyric,
};
