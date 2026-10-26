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

// Core Models (Scalars)
export type Song = FieldOutputTypes["core"]["Song"];
export type Singer = FieldOutputTypes["core"]["Singer"];
export type Artist = FieldOutputTypes["core"]["Artist"];
export type ArtistRole = FieldOutputTypes["core"]["ArtistRole"];
export type Album = FieldOutputTypes["core"]["Album"];
export type Group = FieldOutputTypes["core"]["Group"];
export type Lyrics = FieldOutputTypes["core"]["Lyrics"];
export type Performance = FieldOutputTypes["core"]["Performance"];
export type Creation = FieldOutputTypes["core"]["Creation"];
export type SongExternalLink = FieldOutputTypes["core"]["SongExternalLink"];
export type SongInAlbum = FieldOutputTypes["core"]["SongInAlbum"];
export type SongInSeries = FieldOutputTypes["core"]["SongInSeries"];
export type SongSeries = FieldOutputTypes["core"]["SongSeries"];
export type SongTag = FieldOutputTypes["core"]["SongTag"];
export type Tag = FieldOutputTypes["core"]["Tag"];
export type SvsEngine = FieldOutputTypes["core"]["SvsEngine"];
export type SvsEngineVersion = FieldOutputTypes["core"]["SvsEngineVersion"];
export type Voicebank = FieldOutputTypes["core"]["Voicebank"];

// Meta Models (Scalars)
export type History = FieldOutputTypes["meta"]["History"];
export type Outbox = FieldOutputTypes["meta"]["Outbox"];
export type Permission = FieldOutputTypes["meta"]["Permission"];
export type Role = FieldOutputTypes["meta"]["Role"];
export type RolePermission = FieldOutputTypes["meta"]["RolePermission"];

// Platform Models (Scalars)
export type File = FieldOutputTypes["platform"]["File"];
export type Post = FieldOutputTypes["platform"]["Post"];
export type ReputationHistory = FieldOutputTypes["platform"]["ReputationHistory"];

// Auth Models (Scalars)
export type User = FieldOutputTypes["auth"]["User"];
export type Account = FieldOutputTypes["auth"]["Account"];
export type Session = FieldOutputTypes["auth"]["Session"];
export type Verification = FieldOutputTypes["auth"]["Verification"];

// Enums
export const SongType = {
	ORIGINAL: "ORIGINAL",
	COVER: "COVER",
	RETUNE: "RETUNE",
	CONTRAFACTUM: "CONTRAFACTUM",
	TRANSLYRICS: "TRANSLYRICS",
	REMIX: "REMIX",
	REMASTER: "REMASTER",
	MASHUP: "MASHUP",
	INSTRUMENTAL: "INSTRUMENTAL",
	OTHERS: "OTHERS",
} as const;
export type SongType = (typeof SongType)[keyof typeof SongType];

export const Platform = {
	YOUTUBE: "YOUTUBE",
	NICONICO: "NICONICO",
	BILIBILI: "BILIBILI",
	VOCALOID_WIKI: "VOCALOID_WIKI",
	VOCALOID_LYRICS_WIKI: "VOCALOID_LYRICS_WIKI",
	SOUNDCLOUD: "SOUNDCLOUD",
	NETEASE_MUSIC: "NETEASE_MUSIC",
	QQ_MUSIC: "QQ_MUSIC",
	FIVE_SING: "FIVE_SING",
	KUGOU: "KUGOU",
	SPOTIFY: "SPOTIFY",
	APPLE_MUSIC: "APPLE_MUSIC",
	YOUTUBE_MUSIC: "YOUTUBE_MUSIC",
	WIKIPEDIA: "WIKIPEDIA",
	BAIDU_BAIKE: "BAIDU_BAIKE",
	PIXIV: "PIXIV",
	WEIBO: "WEIBO",
	TWITTER: "TWITTER",
	VOCADB: "VOCADB",
	MOEGIRLPEDIA: "MOEGIRLPEDIA",
	MUSICBRAINZ: "MUSICBRAINZ",
	VCPEDIA: "VCPEDIA",
	XIAOHONGSHU: "XIAOHONGSHU",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const ChangeType = {
	CREATE: "CREATE",
	UPDATE: "UPDATE",
	DELETE: "DELETE",
	RESTORE: "RESTORE",
} as const;
export type ChangeType = (typeof ChangeType)[keyof typeof ChangeType];

export const OutboxStatus = {
	PENDING: "PENDING",
	PROCESSING: "PROCESSING",
	PROCESSED: "PROCESSED",
	FAILED: "FAILED",
} as const;
export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus];
