/**
 * Song endpoints (`/song`).
 *
 * Path parameters ride in the call — `eden.v2.song({ id })` — because Eden
 * turns a `:id` segment into a one-argument function in its proxy tree.
 */
import type { SongResponseDto, UpdateSongRequestDto } from "@cvsa/core";
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

export const songApi = {
	update,
};
