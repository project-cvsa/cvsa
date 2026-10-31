import { Show } from "solid-js";
import { cn } from "@lib/cn";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import StateBadge from "../StateBadge";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { BilibiliVideoMetadataDto, VideoTrackingDto } from "@cvsa/contracts";
import { formatMetric } from "../format";
import ExternalLink from "lucide-solid/icons/external-link";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Camera from "lucide-solid/icons/camera";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Trash2 from "lucide-solid/icons/trash-2";
import Trophy from "lucide-solid/icons/trophy";
import User from "lucide-solid/icons/user";

interface VideoDetailHeroProps {
	aid: string;
	metadata: () => BilibiliVideoMetadataDto | null;
	tracking: () => VideoTrackingDto | null;
	loading: () => boolean;
	pendingAction: () => string | null;
	onAction: (action: "snapshot" | "metadata") => void;
	onRefresh: () => void;
	onPromote: () => void;
	onUntrack: () => void;
}

export default function VideoDetailHero(props: VideoDetailHeroProps) {
	const t = getComponentT("crawler");
	const meta = () => props.metadata();
	const track = () => props.tracking();

	const isOriginal = () => meta()?.copyright === 1;

	return (
		<div class="flex flex-col gap-5">
			{/* Breadcrumb Navigation */}
			<div>
				<a
					href={`/admin/crawler?section=videos&search=${encodeURIComponent(props.aid)}`}
					class="ts-caption text-secondary hover:text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer"
				>
					<ArrowLeft class="w-3.5 h-3.5" />
					<span>{t("common.back")}</span>
				</a>
			</div>

			{/* Main Video Header */}
			<div class="flex flex-col lg:flex-row gap-5">
				{/* Video Cover (Clean, without overlay) */}
				<div class="w-full lg:w-60 aspect-video bg-surface-container-high shrink-0 overflow-hidden flex items-center justify-center">
					<Show
						when={meta()?.pic}
						fallback={<span class="ts-caption text-tertiary">No Cover</span>}
					>
						{(pic) => (
							<img
								src={pic()}
								alt={meta()?.title ?? props.aid}
								class="w-full h-full object-cover"
								referrerPolicy="no-referrer"
							/>
						)}
					</Show>
				</div>

				{/* Video Title & Meta & Actions */}
				<div class="flex flex-col justify-between gap-3 flex-1 min-w-0">
					<div class="flex flex-col gap-2 min-w-0">
						{/* Title */}
						<h1 class="text-heading-3 tracking-heading-3 font-bold text-primary break-words line-clamp-2">
							{meta()?.title ?? `AID ${props.aid}`}
						</h1>

						{/* Identity & Badges Row */}
						<div class="flex flex-wrap items-center gap-2 ts-caption">
							<span class="text-tertiary">AID {props.aid}</span>

							<Show when={meta()?.bvid}>
								{(bvid) => (
									<a
										href={`https://www.bilibili.com/video/${bvid()}`}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 text-primary hover:underline"
									>
										<span>{bvid()}</span>
										<ExternalLink class="w-3 h-3 text-tertiary" />
									</a>
								)}
							</Show>

							<Show when={track()?.state}>
								{(st) => <StateBadge kind="tracking" state={st()} size="sm" />}
							</Show>

							<Show when={meta()?.copyright}>
								<Badge variant={isOriginal() ? "info" : "neutral"} size="sm">
									{isOriginal()
										? t("videoDetail.copyright.original")
										: t("videoDetail.copyright.reprint")}
								</Badge>
							</Show>

							<Show when={meta()?.tname}>
								{(tname) => (
									<Badge variant="default" size="sm">
										{tname()}
									</Badge>
								)}
							</Show>

							<Show when={meta()?.filterDecision}>
								{(decision) => (
									<Badge
										variant={decision() === "accepted" ? "success" : "neutral"}
										size="sm"
									>
										{decision() === "accepted"
											? t("videoDetail.outcome.accepted")
											: t("videoDetail.outcome.rejected")}
									</Badge>
								)}
							</Show>
						</div>

						{/* Uploader */}
						<div class="flex items-center gap-2 pt-0.5 ts-caption text-secondary">
							<div class="w-5 h-5 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center shrink-0">
								<Show
									when={meta()?.ownerFace}
									fallback={<User class="w-3 h-3 text-tertiary" />}
								>
									{(face) => (
										<img
											src={face()}
											alt={meta()?.ownerName ?? "UP"}
											class="w-full h-full object-cover"
											referrerPolicy="no-referrer"
										/>
									)}
								</Show>
							</div>
							<span class="text-primary font-medium">{meta()?.ownerName ?? "—"}</span>
							<Show when={meta()?.mid}>
								{(mid) => (
									<a
										href={`https://space.bilibili.com/${mid()}`}
										target="_blank"
										rel="noopener noreferrer"
										class="text-tertiary hover:text-primary inline-flex items-center gap-0.5 hover:underline"
									>
										<span>MID {mid()}</span>
										<ExternalLink class="w-2.5 h-2.5" />
									</a>
								)}
							</Show>
						</div>
					</div>

					{/* Action Toolbar */}
					<div class="flex flex-wrap items-center gap-2 pt-1">
						<Button
							size="sm"
							variant="outlined"
							loading={props.pendingAction() === "snapshot"}
							onClick={() => props.onAction("snapshot")}
							class="gap-1.5"
						>
							<Camera class="w-3.5 h-3.5" />
							<span>{t("videoDetail.queueSnapshot")}</span>
						</Button>

						<Button
							size="sm"
							variant="outlined"
							onClick={props.onPromote}
							class="gap-1.5 text-primary"
						>
							<Trophy class="w-3.5 h-3.5 text-primary" />
							<span>{t("videoDetail.promoteMilestone")}</span>
						</Button>

						<Button
							size="sm"
							variant="outlined"
							loading={props.pendingAction() === "metadata"}
							onClick={() => props.onAction("metadata")}
							class="gap-1.5"
						>
							<RefreshCw class="w-3.5 h-3.5" />
							<span>{t("videoDetail.queueMetadata")}</span>
						</Button>

						<Button
							size="sm"
							variant="outlined"
							loading={props.loading()}
							onClick={props.onRefresh}
							class="gap-1.5"
						>
							<RefreshCw class="w-3.5 h-3.5" />
							<span>{t("common.refresh")}</span>
						</Button>

						<Show when={track()}>
							<Button
								size="sm"
								variant="outlined"
								loading={props.pendingAction() === "untrack"}
								onClick={props.onUntrack}
								class="gap-1.5 text-error hover:bg-error hover:text-on-error"
							>
								<Trash2 class="w-3.5 h-3.5" />
								<span>{t("videoDetail.untrack")}</span>
							</Button>
						</Show>
					</div>
				</div>
			</div>

			{/* 4-KPI Metric Row */}
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-1">
				<div class="flex flex-col">
					<span class="ts-caption text-tertiary mb-1">{t("videoDetail.views")}</span>
					<span class="text-heading-2 tracking-heading-2 font-bold text-primary">
						{track()?.lastViews != null ? formatMetric(track()?.lastViews ?? 0) : "—"}
					</span>
				</div>
				<div class="flex flex-col">
					<span class="ts-caption text-tertiary mb-1">{t("videoDetail.velocity")}</span>
					<span class="text-heading-2 tracking-heading-2 font-bold text-primary">
						{track()?.velocity != null ? formatMetric(track()?.velocity ?? 0) : "—"}
						<span class="ts-caption text-tertiary ml-1 font-normal">/h</span>
					</span>
				</div>
				<div class="flex flex-col">
					<span class="ts-caption text-tertiary mb-1">{t("videoDetail.priority")}</span>
					<span class="text-heading-2 tracking-heading-2 font-bold text-primary">
						{track()?.priority ?? "—"}
					</span>
				</div>
				<div class="flex flex-col">
					<span class="ts-caption text-tertiary mb-1">{t("videoDetail.failures")}</span>
					<span
						class={cn(
							"text-heading-2 tracking-heading-2 font-bold",
							(track()?.consecutiveFails ?? 0) > 0 ? "text-error" : "text-primary"
						)}
					>
						{track()?.consecutiveFails ?? "—"}
					</span>
				</div>
			</div>
		</div>
	);
}
