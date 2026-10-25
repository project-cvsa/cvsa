import { Temporal } from "temporal-polyfill";
import type { Contract, FieldOutputTypes, Models } from "../prisma/contract.d";

export { Temporal };
export type Instant = Temporal.Instant;

export function toInstant(value: Date | string | Temporal.Instant): Temporal.Instant {
	if (value instanceof Temporal.Instant) {
		return value;
	}
	if (value instanceof Date) {
		return Temporal.Instant.fromEpochMilliseconds(value.getTime());
	}
	return Temporal.Instant.from(value);
}

export type { Contract, Models };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export function toJson(value: unknown): JsonValue {
	if (value === undefined) {
		return null;
	}
	return JSON.parse(
		JSON.stringify(value, (_, v) => {
			if (typeof v === "bigint") {
				return Number(v);
			}
			if (v instanceof Temporal.Instant) {
				return v.toString();
			}
			return v;
		})
	);
}

export type VideoSnapshot = FieldOutputTypes["public"]["VideoSnapshot"];
export type NetworkRuntimeConfig = FieldOutputTypes["public"]["NetworkRuntimeConfig"];
export type VideoTracking = FieldOutputTypes["public"]["VideoTracking"];
export type BilibiliVideoMetadata = FieldOutputTypes["public"]["BilibiliVideoMetadata"];
export type BilibiliVideoMetadataHistory =
	FieldOutputTypes["public"]["BilibiliVideoMetadataHistory"];
export type BilibiliVideoRelation = FieldOutputTypes["public"]["BilibiliVideoRelation"];
export type CrawlerRuntimeConfig = FieldOutputTypes["public"]["CrawlerRuntimeConfig"];
export type DiscoverySample = FieldOutputTypes["public"]["DiscoverySample"];
export type CrawlerStatsRollup = FieldOutputTypes["public"]["CrawlerStatsRollup"];
