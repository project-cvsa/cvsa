import { For, Show, createSignal } from "solid-js";
import Badge from "@components/ui/Badge";
import Button from "@components/ui/Button";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { BilibiliVideoMetadataDto } from "@cvsa/contracts";
import { formatDateTime } from "../format";
import {
	parseTags,
	parseStaff,
	parsePages,
	parseDimension,
	parseHonors,
	formatSecondsToTime,
} from "./utils";
import ExternalLink from "lucide-solid/icons/external-link";
import User from "lucide-solid/icons/user";
import Award from "lucide-solid/icons/award";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";

interface VideoMetadataTabProps {
	data: BilibiliVideoMetadataDto;
}

export default function VideoMetadataTab(props: VideoMetadataTabProps) {
	const t = getComponentT("crawler");
	const [expandedDesc, setExpandedDesc] = createSignal(false);

	const tags = () => parseTags(props.data.tags);
	const staff = () => parseStaff(props.data.staff);
	const pages = () => parsePages(props.data.pages);
	const dimension = () => parseDimension(props.data.dimension);
	const honors = () => parseHonors(props.data.honorReply);

	return (
		<div class="flex flex-col gap-6">
			{/* Basic Properties Grid */}
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 ts-caption">
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.category")}</span>
					<span class="text-primary font-medium">
						{props.data.tname ?? "—"}
						{props.data.tid ? ` (${props.data.tid})` : ""}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.duration")}</span>
					<span class="text-primary font-medium">
						{props.data.duration
							? `${formatSecondsToTime(props.data.duration)} (${props.data.duration}s)`
							: "—"}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.published")}</span>
					<span class="text-primary font-medium">
						{props.data.pubdate ? formatDateTime(props.data.pubdate) : "—"}
					</span>
				</div>
				<div>
					<span class="text-tertiary block mb-1">{t("videoDetail.dimension")}</span>
					<span class="text-primary font-medium">
						{dimension() ? `${dimension()?.width} × ${dimension()?.height}` : "—"}
					</span>
				</div>
			</div>

			{/* Staff / Production Crew */}
			<Show when={staff().length > 0}>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<h3 class="ts-label text-primary font-semibold">
							{t("videoDetail.staff")}
						</h3>
						<span class="ts-caption text-tertiary">({staff().length})</span>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
						<For each={staff()}>
							{(member) => (
								<div class="flex items-center gap-2.5 py-1.5">
									<div class="w-8 h-8 rounded-full overflow-hidden bg-surface-container-high shrink-0 flex items-center justify-center">
										<Show
											when={member.face}
											fallback={<User class="w-3.5 h-3.5 text-tertiary" />}
										>
											<img
												src={member.face}
												alt={member.name}
												class="w-full h-full object-cover"
												referrerPolicy="no-referrer"
											/>
										</Show>
									</div>
									<div class="flex flex-col min-w-0 flex-1">
										<span class="ts-caption text-tertiary">{member.title}</span>
										<a
											href={`https://space.bilibili.com/${member.mid}`}
											target="_blank"
											rel="noopener noreferrer"
											class="ts-caption font-medium text-primary hover:underline truncate inline-flex items-center gap-1"
										>
											<span class="truncate">{member.name}</span>
											<ExternalLink class="w-2.5 h-2.5 shrink-0 text-tertiary" />
										</a>
									</div>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Video Tags */}
			<Show when={tags().length > 0}>
				<div class="flex flex-col gap-2.5">
					<h3 class="ts-label text-primary font-semibold">{t("videoDetail.tags")}</h3>
					<div class="flex flex-wrap gap-1.5">
						<For each={tags()}>
							{(tag) => (
								<span class="px-2 py-0.5 bg-surface-container-high text-secondary ts-caption">
									{tag}
								</span>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Dynamic */}
			<Show when={props.data.dynamic}>
				{(dyn) => (
					<div class="flex flex-col gap-1.5">
						<span class="ts-caption text-tertiary font-medium">
							{t("videoDetail.dynamic")}
						</span>
						<p class="ts-caption text-secondary whitespace-pre-wrap italic">
							“{dyn()}”
						</p>
					</div>
				)}
			</Show>

			{/* Multi-part Pages */}
			<Show when={pages().length > 1}>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2">
						<h3 class="ts-label text-primary font-semibold">
							{t("videoDetail.pages")}
						</h3>
						<span class="ts-caption text-tertiary">({pages().length} P)</span>
					</div>

					<div class="flex flex-col divide-y divide-border ts-caption">
						<For each={pages()}>
							{(part) => (
								<div class="py-2.5 flex items-center justify-between gap-4">
									<div class="flex items-center gap-3 min-w-0">
										<span class="text-tertiary font-bold">P{part.page}</span>
										<span class="text-primary font-medium truncate">
											{part.part}
										</span>
									</div>
									<div class="flex items-center gap-4 shrink-0 text-secondary">
										<span>{formatSecondsToTime(part.duration)}</span>
										<span class="text-tertiary">CID {part.cid}</span>
									</div>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>

			{/* Description */}
			<Show when={props.data.description}>
				{(desc) => (
					<div class="flex flex-col gap-2">
						<div class="flex items-center justify-between">
							<h3 class="ts-label text-primary font-semibold">
								{t("videoDetail.description")}
							</h3>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setExpandedDesc((prev) => !prev)}
								class="ts-caption gap-1 text-secondary"
							>
								<span>{expandedDesc() ? "收起" : "展开"}</span>
								{expandedDesc() ? (
									<ChevronUp class="w-3.5 h-3.5" />
								) : (
									<ChevronDown class="w-3.5 h-3.5" />
								)}
							</Button>
						</div>

						<p
							class={`ts-caption text-secondary whitespace-pre-wrap ${
								expandedDesc() ? "" : "line-clamp-4"
							}`}
						>
							{desc()}
						</p>
					</div>
				)}
			</Show>

			{/* Honors / Achievements */}
			<Show when={honors().length > 0}>
				<div class="flex flex-col gap-2.5">
					<div class="flex items-center gap-2">
						<Award class="w-4 h-4 text-highlight" />
						<h3 class="ts-label text-primary font-semibold">
							{t("videoDetail.honors")}
						</h3>
					</div>
					<div class="flex flex-wrap gap-2">
						<For each={honors()}>
							{(honor) => (
								<Badge variant="warning" size="md">
									{honor}
								</Badge>
							)}
						</For>
					</div>
				</div>
			</Show>
		</div>
	);
}
