/**
 * The web app's HTTP client.
 *
 * Everything goes through here — components must not call `fetch` directly and
 * must not reach for `getEdenClient()` unless an endpoint has no wrapper yet.
 * Requests and responses are typed by the backend contract (`@api-contract`),
 * so a route rename or a payload change fails `bun typecheck` instead of
 * failing in the browser.
 */
import { authApi } from "./auth";
import { songApi } from "./song";

/** Module tree components call: `api.auth.login(...)`, `api.song.update(...)`. */
export const api = {
	auth: authApi,
	song: songApi,
};

export {
	type ApiErrorBody,
	type ApiErrorCode,
	type ApiErrorInfo,
	type ApiResult,
	asApiErrorBody,
	ERROR_CODES,
	isApiErrorCode,
} from "./result";
export {
	configureApiClient,
	type EdenResponse,
	getEdenClient,
	type SettledResponse,
} from "./treaty";
