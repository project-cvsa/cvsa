import type { VideoDetailTag } from "../bilibili";

/**
 * Canonical shape stored in `bilibili_video_metadata.tags`.
 *
 * The column is JSON, so keeping the structured Bilibili tag payload preserves
 * `tag_id` / `tag_type` / `music_id`, which the archive needs to tell a BGM tag
 * ("发现《…》") apart from an ordinary topic tag. Older rows and stubs written
 * from search results only carry `name`, hence every field but `name` is
 * optional.
 */
export interface MetadataTag {
	tagId?: number;
	name: string;
	type?: string;
	musicId?: string;
}

/** Full structured tags from `View` detail (`Tags[]`). */
export function fromDetailTags(tags: readonly VideoDetailTag[]): MetadataTag[] {
	return tags.map((tag) => ({
		tagId: tag.tag_id,
		name: tag.tag_name,
		type: tag.tag_type,
		musicId: tag.music_id,
	}));
}

/** Comma-separated tag string from the search payload (`SearchVideo.tag`). */
export function fromSearchTagString(value: string | null | undefined): MetadataTag[] {
	if (!value) return [];
	return value
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
		.map((name) => ({ name }));
}

/**
 * Tag names for consumers that only care about text (the discovery filter).
 * Tolerates the legacy `string[]` form so pre-migration rows keep working.
 */
export function metadataTagNames(tags: unknown): string[] {
	if (!Array.isArray(tags)) return [];
	const names: string[] = [];
	for (const tag of tags) {
		if (typeof tag === "string") {
			if (tag.length > 0) names.push(tag);
			continue;
		}
		if (tag && typeof tag === "object" && "name" in tag) {
			const name = (tag as { name: unknown }).name;
			if (typeof name === "string" && name.length > 0) names.push(name);
		}
	}
	return names;
}
