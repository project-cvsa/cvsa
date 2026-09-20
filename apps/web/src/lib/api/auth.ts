/**
 * Auth endpoints (`/session`, `/user`, `/me`).
 *
 * Path parameters ride in the call — `eden.v2.song({ id })` — because Eden
 * turns a `:id` segment into a one-argument function in its proxy tree.
 */
import type {
	CurrentUserInfoDto,
	LoginRequestDto,
	LoginResponseDto,
	SignupRequestDto,
	SignupResponseDto,
} from "@cvsa/core";
import type { ApiResult } from "./result";
import { getEdenClient, settle } from "./treaty";

async function login(body: LoginRequestDto): Promise<ApiResult<LoginResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.session.post(body));
}

async function register(body: SignupRequestDto): Promise<ApiResult<SignupResponseDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.user.post(body));
}

/** Terminate the current session. The endpoint answers `204`, so there is no body. */
async function logout(): Promise<ApiResult<null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.session.delete());
}

/** Current visitor's profile. Requires a session cookie or bearer token. */
async function currentUser(): Promise<ApiResult<CurrentUserInfoDto | null>> {
	const eden = getEdenClient();
	return settle(await eden.v2.me.get());
}

export const authApi = {
	login,
	register,
	logout,
	currentUser,
};
