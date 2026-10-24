import type { NetworkDelegate } from "@cvsa/network-scheduler";

export interface BilibiliHttpResponse {
	body: string;
	status: number;
	headers: Record<string, string>;
}

export type BilibiliRequest = (
	url: string,
	options?: {
		headers?: Record<string, string>;
		method?: string;
		body?: string;
		timeoutMs?: number;
	}
) => Promise<BilibiliHttpResponse>;

export interface IBilibiliCache {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface BilibiliClientOptions {
	request?: BilibiliRequest;
	networkDelegate?: NetworkDelegate;
	cache?: IBilibiliCache;
}

export interface SearchVideosOptions {
	page?: number;
	pageSize?: number;
	order?: "totalrank" | "click" | "pubdate" | "dm" | "stow";
	from?: number | Date;
	to?: number | Date;
	categoryId?: number;
	extraParams?: Record<string, string | number | boolean>;
}

export interface BilibiliResponse<T> {
	code: number;
	message: string;
	ttl?: number;
	data: T;
}

export interface SearchVideosData {
	seid: string;
	page: number;
	pagesize: number;
	numResults: number;
	numPages: number;
	result?: SearchVideo[];
	[key: string]: unknown;
}

export interface SearchVideo {
	type: "video";
	id: number;
	aid: number;
	bvid: string;
	author: string;
	mid: number;
	typeid: string;
	typename: string;
	arcurl: string;
	title: string;
	description: string;
	pic: string;
	play: number;
	video_review: number;
	favorites: number;
	tag: string;
	review: number;
	pubdate: number;
	senddate: number;
	duration: string;
	like: number;
	upic: string;
	danmaku: number;
	[key: string]: unknown;
}

export interface VideoStatsSnapshot {
	aid: number;
	views: number;
	danmakus: number;
	replies: number;
	likes: number;
	coins: number;
	shares: number;
	favorites: number;
}

export type VideoDetailsResponse = BilibiliResponse<VideoDetailsData>;
export type VideoViewResponse = BilibiliResponse<VideoDetailView>;

export interface VideoDetailsData {
	View: VideoDetailView;
	Card: VideoDetailCard;
	Tags: VideoDetailTag[];
	Related?: BilibiliRelatedVideo[];
	Reply?: unknown;
}

export interface BilibiliRelatedVideo {
	aid: number;
	bvid: string;
	title: string;
	pic: string;
	desc?: string;
	duration?: number;
	pubdate?: number;
	ctime?: number;
	tid?: number;
	tname?: string;
	copyright?: number;
	owner: VideoOwner;
	stat: VideoStats;
	rcmd_reason?: string;
	cid?: number;
	dynamic?: string;
	[key: string]: unknown;
}

export interface VideoDetailView {
	bvid: string;
	aid: number;
	videos: number;
	tid: number;
	tid_v2: number;
	tname: string;
	tname_v2: string;
	copyright: number;
	pic: string;
	title: string;
	pubdate: number;
	ctime: number;
	desc: string;
	desc_v2: string;
	state: number;
	duration: number;
	mission_id: number;
	rights: VideoRights;
	owner: VideoOwner;
	stat: VideoStats;
	argue_info: VideoArgueInfo;
	dynamic: string;
	cid: number;
	dimension: VideoDimension;
	pages: VideoPage[];
	subtitle: VideoSubtitle;
	staff: VideoStaff[];
}

export interface VideoDetailCard {
	card: VideoCardOwner;
	archive_count: number;
	article_count: number;
	follower: number;
	like_num: number;
}

export interface VideoOwner {
	mid: number;
	name: string;
	face: string;
}

export interface VideoCardOwner extends VideoOwner {
	sex: string;
	fans: number;
	attention: number;
	friend: number;
	sign: string;
	level_info: {
		current_level: number;
	};
}

export interface VideoDetailTag {
	tag_id: number;
	tag_name: string;
	music_id: string;
	tag_type: string;
	jump_url: string;
}

export interface VideoStats {
	aid: number;
	view: number;
	danmaku: number;
	reply: number;
	favorite: number;
	coin: number;
	share: number;
	now_rank: number;
	his_rank: number;
	like: number;
}

export interface VideoArgueInfo {
	argue_msg: string;
	argue_type: number;
	argue_link: string;
}

export interface VideoRights {
	bp: number;
	elec: number;
	download: number;
	movie: number;
	pay: number;
	hd5: number;
	no_reprint: number;
	autoplay: number;
	ugc_pay: number;
	is_cooperation: number;
	ugc_pay_preview: number;
	no_background: number;
	arc_pay: number;
	pay_free_watch: number;
}

export interface VideoDimension {
	width: number;
	height: number;
	rotate: number;
}

export interface VideoPage {
	cid: number;
	page: number;
	from: string;
	part: string;
	duration: number;
	vid: string;
	weblink: string;
	dimension: VideoDimension;
	first_frame: string;
}

export interface VideoSubtitle {
	allow_submit: number;
	list: VideoSubtitleItem[];
}

export interface VideoSubtitleItem {
	id: number;
	lan: string;
	lan_doc: string;
	is_lock: number;
	subtitle_url: string;
	type: number;
	id_str: string;
	ai_type: number;
	ai_status: number;
}

export interface VideoStaff {
	mid: number;
	title: string;
	name: string;
	face: string;
	follower: number;
}

export interface DeviceCookies {
	buvid3: string;
	buvid4: string;
	bNut: string;
}

export interface WbiCredentials {
	ticket: string;
	imgKey: string;
	subKey: string;
}

export interface GetTopicFeedOptions {
	topicId: number;
	sortBy?: 2 | 3;
	offset?: string;
	pageSize?: number;
}

export interface TopicFeedData {
	related_topics: Record<string, unknown>;
	topic_card_list: {
		has_more: boolean;
		items: TopicFeedItem[];
		offset: string;
		topic_sort_by_conf: {
			all_sort_by: { sort_by: number; sort_name: string }[];
			default_sort_by: number;
			show_sort_by: number;
		};
	};
}

export interface TopicFeedItem {
	dynamic_card_item: TopicDynamicCard;
	topic_type: string;
}

export interface TopicDynamicCard {
	basic: {
		comment_id_str: string;
		comment_type: number;
		rid_str: string;
	};
	id_str: string;
	modules: {
		module_author: {
			face: string;
			mid: number;
			name: string;
			pub_action: string;
			pub_time: string;
			pub_ts: number;
			type: string;
		};
		module_dynamic: {
			desc: { text: string } | null;
			major: {
				archive?: {
					aid: string;
					bvid: string;
					cover: string;
					desc: string;
					duration_text: string;
					jump_url: string;
					stat: { danmaku: string; play: string };
					title: string;
					type: number;
				};
				type: string;
			} | null;
		};
		module_stat: {
			comment: { count: number; forbidden: boolean };
			forward: { count: number; forbidden: boolean };
			like: { count: number; forbidden: boolean; status: boolean };
		};
	};
	type: string;
	visible: boolean;
}
