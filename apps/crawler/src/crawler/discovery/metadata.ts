import { toInstant } from "@cvsa/snapshot-db";
import type { VideoDetailsData } from "../bilibili";
import { fromDetailTags } from "./tags";
import type { UpsertMetadataInput } from "./types";

export function toMetadataInput(
	aid: bigint,
	details: VideoDetailsData,
	extra?: Partial<UpsertMetadataInput>
): UpsertMetadataInput {
	const view = details.View;
	const card = details.Card;
	const tags = details.Tags ?? [];
	const now = toInstant(new Date());

	return {
		aid,
		bvid: view.bvid,
		cid: view.cid ? BigInt(view.cid) : null,
		videos: view.videos ?? 1,
		tid: view.tid ?? null,
		tidV2: view.tid_v2 ?? null,
		tname: view.tname ?? null,
		tnameV2: view.tname_v2 ?? null,
		copyright: view.copyright ?? null,
		pic: view.pic ?? null,
		title: view.title,
		pubdate: view.pubdate ? toInstant(new Date(view.pubdate * 1_000)) : null,
		ctime: view.ctime ? toInstant(new Date(view.ctime * 1_000)) : null,
		description: view.desc ?? null,
		descV2: view.desc_v2 ?? null,
		state: view.state ?? 0,
		duration: view.duration ?? 0,
		Dynamic: view.dynamic ?? null,
		dimension: view.dimension ?? null,
		mid: view.owner?.mid ? BigInt(view.owner.mid) : null,
		ownerName: view.owner?.name ?? card?.card?.name ?? null,
		ownerFace: view.owner?.face ?? card?.card?.face ?? null,
		pages: view.pages ?? null,
		staff: view.staff ?? null,
		rights: view.rights ?? null,
		honorReply: view.honor_reply ?? null,
		tags: fromDetailTags(tags),
		videoStatus: "normal",
		capturedAt: now,
		...extra,
	};
}
