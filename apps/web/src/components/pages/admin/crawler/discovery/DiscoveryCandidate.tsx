import { Show } from "solid-js";
import clsx from "clsx";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import { CONTROL_HEIGHT } from "@components/ui/controlStyles";
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
			case "model_rejected":
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
				"p-3.5 flex items-center justify-between gap-4 transition-colors",
				props.focused ? "bg-surface-container-low" : "bg-surface hover:bg-hover"
			)}
		>
			{/* Col 1: Index Number */}
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
					"w-10 shrink-0 flex items-center justify-center text-xs font-semibold border transition-colors select-none",
					CONTROL_HEIGHT.sm,
					props.focused
						? "bg-primary text-display-inverted border-primary"
						: "bg-surface-container-high border-border text-tertiary hover:border-secondary hover:text-primary"
				)}
			>
				#{props.index + 1}
			</button>

			{/* Col 2: Video Cover */}
			<div class="w-32 h-20 shrink-0 border border-border bg-surface-container-high overflow-hidden flex items-center justify-center">
				<Show
					when={props.item.pic}
					fallback={<span class="text-xs text-tertiary">{t("discoveryUi.noCover")}</span>}
				>
					{(pic) => (
						<img
							src={pic()}
							alt={props.item.title}
							class="w-full h-full object-cover"
							loading="lazy"
							referrerPolicy="no-referrer"
						/>
					)}
				</Show>
			</div>

			{/* Col 3: Metadata & Title */}
			<div class="flex-1 min-w-0 pr-4 flex flex-col justify-center gap-1.5">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="text-xs text-tertiary tabular-nums shrink-0">
						av{props.item.aid}
					</span>
					<a
						href={`https://www.bilibili.com/video/${props.item.bvid}`}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-secondary hover:text-primary hover:underline inline-flex items-center gap-1 shrink-0"
					>
						<span>{props.item.bvid}</span>
						<ExternalLink class="w-3 h-3 text-tertiary" />
					</a>
					<div class="shrink-0">{decision()}</div>
				</div>
				<a
					href={`https://www.bilibili.com/video/${props.item.bvid}`}
					target="_blank"
					rel="noopener noreferrer"
					class="font-medium text-sm text-primary hover:underline truncate block"
					title={props.item.title}
				>
					{props.item.title}
				</a>
			</div>

			{/* Col 4: Confidence Score & Visual Meter */}
			<div class="w-40 shrink-0 flex flex-col justify-center px-4 gap-1.5">
				<div class="flex items-center justify-between text-xs">
					<span class="text-tertiary">{t("discoveryUi.confidence")}</span>
					<span class="font-semibold text-primary">
						{formatPercent(props.item.songProbability ?? 0)}
					</span>
				</div>
				<div class="w-full bg-surface-container-high h-1.5 overflow-hidden">
					<div
						class={clsx(
							"h-full transition-all",
							(props.item.songProbability ?? 0) >= 0.8
								? "bg-success"
								: (props.item.songProbability ?? 0) >= 0.5
									? "bg-warning"
									: "bg-tertiary"
						)}
						style={{
							width: `${Math.min(100, Math.max(0, (props.item.songProbability ?? 0) * 100))}%`,
						}}
					/>
				</div>
			</div>

			{/* Col 5: Actions - Fixed width to prevent any layout jitter */}
			<div class="w-64 shrink-0 flex items-center justify-end gap-2 pl-4">
				<Button
					size="sm"
					variant={props.item.humanLabel === 1 ? "filled" : "outlined"}
					disabled={props.busy}
					onClick={() => props.onLabel(true)}
					class={clsx(
						"w-[110px] px-2 gap-1 whitespace-nowrap",
						props.item.humanLabel === 1
							? "bg-success border-success text-display-inverted"
							: "hover:border-success hover:text-success"
					)}
				>
					<span class="inline-flex items-center gap-1 truncate text-xs">
						<Check class="w-3.5 h-3.5 shrink-0" />
						<span>
							{props.item.humanLabel === 1
								? t("discovery.samples.label.isSong")
								: t("discovery.samples.label.markSong")}
						</span>
					</span>
				</Button>
				<Button
					size="sm"
					variant={props.item.humanLabel === 0 ? "filled" : "outlined"}
					disabled={props.busy}
					onClick={() => props.onLabel(false)}
					class={clsx(
						"w-[110px] px-2 gap-1 whitespace-nowrap",
						props.item.humanLabel === 0
							? "bg-error border-error text-display-inverted"
							: "hover:border-error hover:text-error"
					)}
				>
					<span class="inline-flex items-center gap-1 truncate text-xs">
						<X class="w-3.5 h-3.5 shrink-0" />
						<span>
							{props.item.humanLabel === 0
								? t("discovery.samples.label.isNonSong")
								: t("discovery.samples.label.markNonSong")}
						</span>
					</span>
				</Button>
			</div>
		</article>
	);
}
