/**
 * Route protection rule tables, matched against `context.url.pathname`.
 * Register new protected pages in `AUTH_REQUIRED_ROUTES`.
 */

/** Pages that require a logged-in user; anonymous visitors are redirected to /login. */
export const AUTH_REQUIRED_ROUTES: RegExp[] = [/^\/song\/\d+\/edit$/];

/** Admin pages; only reachable by logged-in users with OWNER or admin role. */
export const ADMIN_REQUIRED_ROUTES: RegExp[] = [/^\/admin(\/.*)?$/];

/** Pages only reachable while logged out; logged-in visitors are redirected to /. */
export const ANONYMOUS_ONLY_ROUTES: RegExp[] = [/^\/login$/, /^\/register$/];
