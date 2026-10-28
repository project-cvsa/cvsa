import { Show } from "solid-js";
import clsx from "clsx";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoverySampleItem } from "@cvsa/contracts";
import { formatPercent } from "../format";
import ExternalLink from "lucide-solid/icons/external-link";
import Check from "lucide-solid/icons/check";
import X from "lucide-solid/icons/x";

type DiscoveryCandidateProps = {
	item: DiscoverySampleItem;
	index: number;
	focused: boolean;
	busy: boolean;
	onFocus: () => void;
	onLabel: (isSong: boolean) => void;
};

export default function DiscoveryCandidate(props: DiscoveryCandidateProps) {
	const t = getComponentT("crawler");
	const decision = () => {
		switch (props.item.decision) {
			case "whitelist":
				return (
					<Badge variant="info" size="sm">
						{t("discoveryUi.whitelist")}
					</Badge>
				);
			case "model_accepted":
				return (
					<Badge variant="success" size="sm">
						{t("discoveryUi.modelAccepted")}
					</Badge>
				);
			case "model_rejected_sampled":
				return (
					<Badge variant="warning" size="sm">
						{t("discoveryUi.modelRejected")}
					</Badge>
				);
			default:
				return (
					<Badge variant="neutral" size="sm">
						{props.item.decision}
					</Badge>
				);
		}
	};
	return (
		<article
			class={clsx(
				"p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors",
				props.focused ? "bg-surface-container-low" : "bg-surface hover:bg-hover"
			)}
		>
			<div class="flex items-start gap-3 min-w-0 flex-1">
				<button
					type="button"
					data-review-focus="true"
					onClick={props.onFocus}
					aria-label={t("discoveryUi.focusCandidate").replace(
						"{number}",
						String(props.index + 1)
					)}
					aria-pressed={props.focused}
					class={clsx(
						"text-xs px-1.5 py-0.5 border shrink-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-primary",
						props.focused
							? "bg-primary text-display-inverted border-primary"
							: "bg-surface-container-high border-border text-tertiary"
					)}
				>
					#{props.index + 1}
				</button>
				<Show
					when={props.item.pic}
					fallback={
						<div class="w-24 h-15 bg-surface-container-high flex items-center justify-center text-xs text-tertiary shrink-0">
							{t("discoveryUi.noCover")}
						</div>
					}
				>
					{(pic) => (
						<img
							src={pic()}
							alt={props.item.title}
							class="w-24 h-15 shrink-0 object-cover"
							loading="lazy"
							referrerPolicy="no-referrer"
						/>
					)}
				</Show>
				<div class="flex flex-col gap-1 min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="ts-caption text-tertiary">av{props.item.aid}</span>
						<a
							href={`https://www.bilibili.com/video/${props.item.bvid}`}
							target="_blank"
							rel="noopener noreferrer"
							class="ts-caption text-primary hover:underline inline-flex items-center gap-1"
						>
							{props.item.bvid}
							<ExternalLink class="w-3 h-3 text-tertiary" />
						</a>
						{decision()}
					</div>
					<a
						href={`https://www.bilibili.com/video/${props.item.bvid}`}
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium text-sm text-primary hover:underline line-clamp-1"
						title={props.item.title}
					>
						{props.item.title}
					</a>
					<div class="flex items-center gap-2 max-w-xs pt-0.5">
						<span class="ts-caption text-tertiary shrink-0">
							{t("discoveryUi.confidence")}:
						</span>
						<div class="flex-1 h-1.5 bg-surface-container-high overflow-hidden">
							<div
								class={clsx(
									"h-full",
									props.item.songProbability >= 0.7 ? "bg-primary" : "bg-tertiary"
								)}
								style={{
									width: `${Math.round(props.item.songProbability * 100)}%`,
								}}
							/>
						</div>
						<span class="ts-caption text-primary">
							{formatPercent(props.item.songProbability)}
						</span>
					</div>
				</div>
			</div>
			<div class="flex flex-wrap gap-2 shrink-0 self-end md:self-center">
				<Button
					size="sm"
					variant={props.item.humanLabel === 1 ? "filled" : "outlined"}
					disabled={props.busy}
					onClick={() => props.onLabel(true)}
					class="gap-1"
				>
					<Check class="w-3.5 h-3.5" />
					{t("discoveryUi.song")}
				</Button>
				<Button
					size="sm"
					variant={props.item.humanLabel === 0 ? "filled" : "outlined"}
					disabled={props.busy}
					onClick={() => props.onLabel(false)}
					class="gap-1"
				>
					<X class="w-3.5 h-3.5" />
					{t("discoveryUi.notSong")}
				</Button>
			</div>
		</article>
	);
}
