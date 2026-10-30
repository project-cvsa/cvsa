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

export const SONG_TYPE_VALUES: readonly SongType[] = Object.values(SongType);
export const PLATFORM_VALUES: readonly Platform[] = Object.values(Platform);
export const CHANGE_TYPE_VALUES: readonly ChangeType[] = Object.values(ChangeType);
export const OUTBOX_STATUS_VALUES: readonly OutboxStatus[] = Object.values(OutboxStatus);
