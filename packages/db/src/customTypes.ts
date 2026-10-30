import { customType } from "drizzle-orm/pg-core";
import { Temporal } from "temporal-polyfill";

/**
 * `timestamp with time zone` carried as a `Temporal.Instant`.
 *
 * The domain already reasons about instants (scheduling, audit trails), so
 * mapping at the column level keeps rows typed on read and removes the
 * per-query `Date` conversion.
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

/** `@updatedAt`: set on insert unless the caller provided one, refreshed on update. */
export const managedInstant = (name: string) =>
	temporalInstant(name)
		.$defaultFn(() => Temporal.Now.instant())
		.$onUpdate(() => Temporal.Now.instant());
