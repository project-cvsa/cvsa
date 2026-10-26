/**
 * The HTTP contract consumed by out-of-process clients (the Eden Treaty client
 * in `apps/web`). This module is **type-only**: it must never be imported as a
 * value, and nothing here is executed when a client compiles against it.
 *
 * Treat it like a published API surface — keep it expressive enough for the
 * client to derive bodies, params, queries and responses without reaching into
 * implementation modules.
 */
export type { App } from "./index";
