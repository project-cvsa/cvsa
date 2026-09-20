/**
 * Route protection rule tables, matched against `context.url.pathname`.
 * Register new protected pages in `AUTH_REQUIRED_ROUTES`.
 */

/** Pages that require a logged-in user; anonymous visitors are redirected to /login. */
export const AUTH_REQUIRED_ROUTES: RegExp[] = [/^\/song\/\d+\/edit$/];

/** Pages only reachable while logged out; logged-in visitors are redirected to /. */
export const ANONYMOUS_ONLY_ROUTES: RegExp[] = [/^\/login$/, /^\/register$/];
