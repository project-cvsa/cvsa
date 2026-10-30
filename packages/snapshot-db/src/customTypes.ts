import { customType } from "drizzle-orm/pg-core";
import { Temporal } from "temporal-polyfill";

/**
 * `timestamp with time zone` carried as a `Temporal.Instant`.
 *
 * Every crawler table stores instants, and `Temporal.Instant` is what the
 * scheduler arithmetic depends on (no silent local-time coercion like `Date`).
 * Mapping it at the column level removes the per-query conversion that the
 * Prisma contract forced on every read.
 */
export const temporalInstant = customType<{
	data: Temporal.Instant;
	driverData: string | Date;
}>({
	dataType() {
		return "timestamp with time zone";
	},
	fromDriver(value) {
		return value instanceof Date
			? Temporal.Instant.fromEpochMilliseconds(value.getTime())
			: Temporal.Instant.from(value);
	},
	toDriver(value) {
		return value.toString();
	},
});
