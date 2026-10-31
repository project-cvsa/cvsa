import { For, Show, createSignal, onMount } from "solid-js";
import { getComponentT } from "@lib/i18n/isomorphic";
import { api } from "@lib/api";
import type { BilibiliVideoMetadataDto, BilibiliVideoRelationDto } from "@cvsa/contracts";
import { formatDateTime } from "../format";
import ExternalLink from "lucide-solid/icons/external-link";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Network from "lucide-solid/icons/network";

interface VideoDiscoveryTabProps {
	aid: string;
	metadata: BilibiliVideoMetadataDto;
}

export default function VideoDiscoveryTab(props: VideoDiscoveryTabProps) {
	const t = getComponentT("crawler");
	const [relations, setRelations] = createSignal<BilibiliVideoRelationDto[]>([]);
	const [loadingRelations, setLoadingRelations] = createSignal(false);

	const origin = () => props.metadata.discoveryContext?.origin;
	const decision = () => props.metadata.discoveryContext?.decision;

	const channelLabel = (channel?: string) => {
		switch (channel) {
			case "search":
				return t("videoDetail.channel.search");
			case "related":
				return t("videoDetail.channel.related");
			case "graph":
				return t("videoDetail.channel.graph");
			default:
				return t("videoDetail.channel.manual");
		}
	};

	const outcomeLabel = (outcome?: string) =>
		outcome === "accepted"
			? t("videoDetail.outcome.accepted")
			: t("videoDetail.outcome.rejected");

	const reasonLabel = (reason?: string) => {
		switch (reason) {
			case "whitelist_match":
				return t("videoDetail.reason.whitelistMatch");
			case "model_accept":
				return t("videoDetail.reason.modelAccept");
			case "model_reject":
				return t("videoDetail.reason.modelReject");
			case "model_unavailable":
				return t("videoDetail.reason.modelUnavailable");
			case "duration_out_of_range":
				return t("videoDetail.reason.durationOutOfRange");
			case "blacklist_match":
				return t("videoDetail.reason.blacklistMatch");
			default:
				return reason ?? "—";
		}
	};

	onMount(async () => {
		setLoadingRelations(true);
		const res = await api.crawler.getRelations(props.aid);
		setLoadingRelations(false);
		if (res.ok && res.data) {
			setRelations(res.data);
		}
	});

	return (
		<div class="flex flex-col gap-6">
			{/* Discovery Origin & Decision */}
			<div class="flex flex-col gap-4">
				<h3 class="ts-label text-primary font-semibold">
					{t("videoDetail.discoveryOrigin")}
				</h3>

				<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 ts-caption">
					<div>
						<span class="text-tertiary block mb-1">{t("videoDetail.channel")}</span>
						<span class="text-primary font-medium">
							{channelLabel(origin()?.channel)}
						</span>
					</div>

					<Show when={origin()?.search}>
						{(search) => (
							<>
								<div>
									<span class="text-tertiary block mb-1">
										{t("videoDetail.keyword")}
									</span>
									<span class="text-primary font-medium">{search().keyword}</span>
								</div>
								<div>
									<span class="text-tertiary block mb-1">
										{t("videoDetail.position")}
									</span>
									<span class="text-primary font-medium">
										{t("videoDetail.page")} {search().page} · 第{" "}
										{search().position} 位
									</span>
								</div>
							</>
						)}
					</Show>

					<Show when={origin()?.related}>
						{(related) => (
							<>
								<div>
									<span class="text-tertiary block mb-1">
										{t("videoDetail.sourceAid")}
									</span>
									<a
										href={`/admin/crawler/video/${related().sourceAid}`}
										class="text-primary hover:underline"
									>
										av{related().sourceAid}
									</a>
								</div>
								<div>
									<span class="text-tertiary block mb-1">
										{t("videoDetail.position")}
									</span>
									<span class="text-primary font-medium">
										第 {related().position} 位
									</span>
								</div>
							</>
						)}
					</Show>

					<div>
						<span class="text-tertiary block mb-1">{t("videoDetail.captured")}</span>
						<span class="text-primary font-medium">
							{origin()?.capturedAt ? formatDateTime(origin()?.capturedAt) : "—"}
						</span>
					</div>
				</div>

				{/* Decision Breakdown */}
				<Show when={decision()}>
					{(val) => (
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 ts-caption">
							<div>
								<span class="text-tertiary block mb-1">
									{t("videoDetail.decision")}
								</span>
								<span class="text-primary font-medium">
									{outcomeLabel(val().outcome)} · {reasonLabel(val().reason)}
								</span>
							</div>

							<div>
								<span class="text-tertiary block mb-1">
									{val().model
										? t("videoDetail.songProbability")
										: t("videoDetail.confidence")}
								</span>
								<span class="text-primary font-medium">
									{(val().confidence * 100).toFixed(1)}%
								</span>
							</div>

							<Show when={val().model}>
								{(model) => (
									<div>
										<span class="text-tertiary block mb-1">
											{t("videoDetail.model")}
										</span>
										<span class="text-primary font-medium">
											{model().modelVersion} (
											{(model().songProbability * 100).toFixed(1)}%)
										</span>
									</div>
								)}
							</Show>

							<Show when={val().rules?.matchedSinger}>
								{(singer) => (
									<div>
										<span class="text-tertiary block mb-1">
											{t("videoDetail.matchedSinger")}
										</span>
										<span class="text-primary font-medium">{singer()}</span>
									</div>
								)}
							</Show>
						</div>
					)}
				</Show>
			</div>

			{/* Recommendation Network (Relations) */}
			<div class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Network class="w-4 h-4 text-primary" />
						<h3 class="ts-label text-primary font-semibold">
							{t("videoDetail.relationsTitle")}
						</h3>
						<span class="ts-caption text-tertiary">({relations().length})</span>
					</div>
				</div>

				<Show
					when={relations().length > 0}
					fallback={
						<div class="py-8 text-center ts-caption text-tertiary">
							{loadingRelations()
								? t("common.loading")
								: t("videoDetail.relationsEmpty")}
						</div>
					}
				>
					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
						<For each={relations()}>
							{(rel) => (
								<div class="p-3 bg-surface border border-border flex flex-col justify-between gap-2 ts-caption">
									<div class="flex items-center justify-between">
										<span class="px-1.5 py-0.5 bg-surface-container-high text-tertiary">
											#{rel.position}
										</span>
										<span class="text-tertiary">
											{formatDateTime(rel.capturedAt)}
										</span>
									</div>

									<div class="flex items-center justify-between gap-2 pt-1 border-t border-border">
										<span class="font-medium text-primary">
											av{rel.targetAid}
										</span>
										<div class="flex items-center gap-2">
											<a
												href={`/admin/crawler/video/${rel.targetAid}`}
												class="text-secondary hover:text-primary inline-flex items-center gap-0.5 hover:underline"
												title={t("videoDetail.viewInCrawler")}
											>
												<span>详情</span>
												<ArrowRight class="w-3 h-3" />
											</a>
											<a
												href={`https://www.bilibili.com/video/av${rel.targetAid}`}
												target="_blank"
												rel="noopener noreferrer"
												class="text-tertiary hover:text-primary inline-flex items-center gap-0.5"
												title={t("videoDetail.viewInBilibili")}
											>
												<ExternalLink class="w-3 h-3" />
											</a>
										</div>
									</div>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>
		</div>
	);
}
