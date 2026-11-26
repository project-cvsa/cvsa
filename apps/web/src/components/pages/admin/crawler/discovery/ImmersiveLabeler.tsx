import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { cn } from "@lib/cn";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { DiscoverySampleItem, VideoAnnotationDto } from "@cvsa/contracts";
import { api } from "@lib/api";
import { formatPercent } from "../format";
import ExternalLink from "lucide-solid/icons/external-link";
import Check from "lucide-solid/icons/check";
import X from "lucide-solid/icons/x";
import HelpCircle from "lucide-solid/icons/help-circle";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import XIcon from "lucide-solid/icons/x";
import TagIcon from "lucide-solid/icons/tag";
import Clock from "lucide-solid/icons/clock";
import UserIcon from "lucide-solid/icons/user";

const PRESET_TAGS = [
	"VOCALOID",
	"Synthesizer V",
	"UTAU",
	"CeVIO",
	"原创曲",
	"翻唱",
	"PV/MMD",
	"非音乐/杂谈",
	"BGM/伴奏",
] as const;

export interface ImmersiveLabelerProps {
	item: DiscoverySampleItem;
	index: number;
	total: number;
	busy: boolean;
	onClose: () => void;
	onNext: () => void;
	onPrev: () => void;
	onLabel: (
		aid: string,
		isSong: boolean,
		options?: {
			decision?: "accepted" | "rejected" | "uncertain";
			tags?: string[];
			notes?: string;
		}
	) => Promise<void>;
}

export default function ImmersiveLabeler(props: ImmersiveLabelerProps) {
	const t = getComponentT("crawler:discovery");

	const [notes, setNotes] = createSignal("");
	const [selectedTags, setSelectedTags] = createSignal<string[]>([]);
	const [annotations, setAnnotations] = createSignal<VideoAnnotationDto[]>([]);
	const [loadingAnnotations, setLoadingAnnotations] = createSignal(false);

	const loadAnnotations = async (aid: string) => {
		setLoadingAnnotations(true);
		const result = await api.crawler.listSampleAnnotations(aid);
		setLoadingAnnotations(false);
		if (result.ok && result.data) {
			setAnnotations(result.data);
		} else {
			setAnnotations([]);
		}
	};

	createEffect(() => {
		const currentAid = props.item.aid;
		setNotes("");
		setSelectedTags([]);
		void loadAnnotations(currentAid);
	});

	const toggleTag = (tag: string) => {
		setSelectedTags((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
		);
	};

	const handleAction = async (decision: "accepted" | "rejected" | "uncertain") => {
		if (props.busy) return;
		const isSong = decision === "accepted";
		await props.onLabel(props.item.aid, isSong, {
			decision,
			tags: selectedTags().length > 0 ? selectedTags() : undefined,
			notes: notes().trim() || undefined,
		});
		void loadAnnotations(props.item.aid);
	};

	onMount(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (
				event.target instanceof Element &&
				event.target.closest("input,textarea,select,button,[contenteditable=true]")
			) {
				return;
			}

			switch (event.key) {
				case "a":
				case "A":
				case "1":
					event.preventDefault();
					void handleAction("accepted");
					break;
				case "r":
				case "R":
				case "2":
					event.preventDefault();
					void handleAction("rejected");
					break;
				case "u":
				case "U":
					event.preventDefault();
					void handleAction("uncertain");
					break;
				case "ArrowLeft":
				case "k":
					event.preventDefault();
					props.onPrev();
					break;
				case "ArrowRight":
				case "j":
				case " ":
					event.preventDefault();
					props.onNext();
					break;
				case "Escape":
					event.preventDefault();
					props.onClose();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
	});

	const decisionBadge = () => {
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

	const curationBadge = () => {
		const status = props.item.curationStatus;
		if (status === "accepted") {
			return (
				<Badge variant="success" size="sm">
					{t("discoveryUi.accepted")}
				</Badge>
			);
		}
		if (status === "rejected") {
			return (
				<Badge variant="danger" size="sm">
					{t("discoveryUi.rejected")}
				</Badge>
			);
		}
		if (status === "pending") {
			return (
				<Badge variant="warning" size="sm">
					{t("discoveryUi.pending")}
				</Badge>
			);
		}
		return null;
	};

	return (
		<div class="flex flex-col gap-4 bg-surface-container rounded-lg border border-border p-6 shadow-md">
			{/* Header Navigation Bar */}
			<div class="flex items-center justify-between border-b border-border pb-4">
				<div class="flex items-center gap-3">
					<Badge variant="neutral" size="md">
						#{props.index + 1} / {props.total}
					</Badge>
					<span class="ts-caption text-secondary">
						AID: {props.item.aid} · {props.item.bvid}
					</span>
					{decisionBadge()}
					{curationBadge()}
				</div>
				<div class="flex items-center gap-2">
					<Button
						size="sm"
						variant="outlined"
						onClick={props.onPrev}
						disabled={props.index === 0}
						aria-label={t("discoveryUi.prevVideo")}
					>
						<ChevronLeft class="w-4 h-4 mr-1" />
						{t("discoveryUi.prevVideo")}
					</Button>
					<Button
						size="sm"
						variant="outlined"
						onClick={props.onNext}
						disabled={props.index >= props.total - 1}
						aria-label={t("discoveryUi.nextVideo")}
					>
						{t("discoveryUi.nextVideo")}
						<ChevronRight class="w-4 h-4 ml-1" />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={props.onClose}
						aria-label={t("discoveryUi.listMode")}
					>
						<XIcon class="w-4 h-4 mr-1" />
						{t("discoveryUi.listMode")}
					</Button>
				</div>
			</div>

			{/* Main Content Grid */}
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Left Column: Media & Metadata (7 cols) */}
				<div class="lg:col-span-7 flex flex-col gap-4">
					{/* Video Cover & Link */}
					<div class="relative w-full aspect-video bg-surface-container-high rounded-md overflow-hidden border border-border group">
						<Show
							when={props.item.pic}
							fallback={
								<div class="w-full h-full flex items-center justify-center text-tertiary">
									{t("discoveryUi.noCover")}
								</div>
							}
						>
							{(pic) => (
								<img
									src={pic()}
									alt={props.item.title}
									class="w-full h-full object-cover"
									referrerPolicy="no-referrer"
								/>
							)}
						</Show>
						<a
							href={`https://www.bilibili.com/video/${props.item.bvid}`}
							target="_blank"
							rel="noopener noreferrer"
							class="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded bg-scrim hover:bg-scrim/90 text-display-inverted ts-caption backdrop-blur-sm transition-colors shadow-md"
						>
							<span>{t("discoveryUi.viewBilibili")}</span>
							<ExternalLink class="w-3.5 h-3.5" />
						</a>
					</div>

					{/* Title */}
					<h3 class="ts-heading-3 text-primary leading-snug">{props.item.title}</h3>

					{/* Model Score Breakdown Bar */}
					<div class="flex flex-col gap-1.5 p-3 rounded-md bg-surface-container-low border border-border/60">
						<div class="flex items-center justify-between ts-caption">
							<span class="text-secondary">{t("discoveryUi.confidence")}</span>
							<span class="font-semibold text-primary font-code">
								{formatPercent(props.item.songProbability)}
							</span>
						</div>
						<div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
							<div
								class={cn(
									"h-full transition-all duration-300",
									props.item.songProbability >= 0.8
										? "bg-success"
										: props.item.songProbability >= 0.5
											? "bg-warning"
											: "bg-danger"
								)}
								style={{
									width: `${Math.round(props.item.songProbability * 100)}%`,
								}}
							/>
						</div>
						<div class="flex items-center justify-between text-caption text-tertiary">
							<span>Model: {props.item.modelVersion}</span>
							<span>AID: {props.item.aid}</span>
						</div>
					</div>

					{/* Video Description */}
					<Show when={props.item.description}>
						<div class="flex flex-col gap-1.5">
							<span class="ts-caption font-semibold text-secondary">
								{t("discovery.samples.col.title")}
							</span>
							<div class="p-3 rounded-md bg-surface-container-low border border-border/40 ts-body-sm text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
								{props.item.description}
							</div>
						</div>
					</Show>

					{/* Original B站 Tags */}
					<Show when={props.item.tags && props.item.tags.length > 0}>
						<div class="flex flex-col gap-1.5">
							<span class="ts-caption font-semibold text-secondary">
								{t("discoveryUi.tags")}
							</span>
							<div class="flex flex-wrap gap-1.5">
								<For each={props.item.tags}>
									{(tag) => (
										<span class="px-2 py-0.5 rounded text-caption bg-surface-container-high text-secondary border border-border/40">
											{tag}
										</span>
									)}
								</For>
							</div>
						</div>
					</Show>
				</div>

				{/* Right Column: Interactive Review & Multi-Record Annotations (5 cols) */}
				<div class="lg:col-span-5 flex flex-col gap-5 border-t lg:border-t-0 lg:border-l border-border lg:pl-6 pt-4 lg:pt-0">
					{/* Decision Actions */}
					<div class="flex flex-col gap-2.5">
						<span class="ts-caption font-semibold text-secondary">
							{t("discoveryUi.curationVerdict")}
						</span>
						<div class="grid grid-cols-2 gap-2">
							<Button
								variant="filled"
								size="md"
								disabled={props.busy}
								onClick={() => handleAction("accepted")}
								class="flex items-center justify-center gap-1.5 bg-success hover:bg-success/90 border-transparent text-display-inverted"
							>
								<Check class="w-4 h-4" />
								<span>{t("discoveryUi.markSongAction")} [A]</span>
							</Button>
							<Button
								variant="filled"
								size="md"
								disabled={props.busy}
								onClick={() => handleAction("rejected")}
								class="flex items-center justify-center gap-1.5 bg-danger hover:bg-danger/90 border-transparent text-display-inverted"
							>
								<X class="w-4 h-4" />
								<span>{t("discoveryUi.markNonSongAction")} [R]</span>
							</Button>
						</div>
						<Button
							variant="outlined"
							size="sm"
							disabled={props.busy}
							onClick={() => handleAction("uncertain")}
							class="flex items-center justify-center gap-1.5 text-secondary"
						>
							<HelpCircle class="w-3.5 h-3.5" />
							<span>{t("discoveryUi.markUncertainAction")} [U]</span>
						</Button>
					</div>

					{/* Preset Tag Selector */}
					<div class="flex flex-col gap-2">
						<div class="flex items-center gap-1.5 text-secondary">
							<TagIcon class="w-3.5 h-3.5" />
							<span class="ts-caption font-semibold">
								{t("discoveryUi.presetTags")}
							</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							<For each={PRESET_TAGS}>
								{(tag) => {
									const active = () => selectedTags().includes(tag);
									return (
										<button
											type="button"
											onClick={() => toggleTag(tag)}
											class={cn(
												"px-2.5 py-1 rounded-full text-caption font-medium border transition-colors cursor-pointer",
												active()
													? "bg-primary text-display-inverted border-primary"
													: "bg-surface-container-low text-secondary border-border hover:border-secondary hover:text-primary"
											)}
										>
											{tag}
										</button>
									);
								}}
							</For>
						</div>
					</div>

					{/* Reviewer Notes */}
					<div class="flex flex-col gap-1.5">
						<span class="ts-caption font-semibold text-secondary">
							{t("discoveryUi.notes")}
						</span>
						<TextField
							size="sm"
							placeholder={t("discoveryUi.notesPlaceholder")}
							value={notes()}
							onInput={(e) => setNotes(e.currentTarget.value)}
						/>
					</div>

					{/* Annotations Timeline */}
					<div class="flex flex-col gap-2 pt-2 border-t border-border/60">
						<div class="flex items-center justify-between">
							<span class="ts-caption font-semibold text-secondary">
								{t("discoveryUi.annotationHistory")} ({annotations().length})
							</span>
							<Show when={loadingAnnotations()}>
								<span class="text-caption text-tertiary">
									{t("common.loading")}
								</span>
							</Show>
						</div>

						<Show
							when={annotations().length > 0}
							fallback={
								<p class="ts-caption text-tertiary italic">
									{t("discoveryUi.noAnnotations")}
								</p>
							}
						>
							<div class="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
								<For each={annotations()}>
									{(ann) => (
										<div class="p-2.5 rounded bg-surface-container-low border border-border/60 flex flex-col gap-1 text-caption">
											<div class="flex items-center justify-between">
												<div class="flex items-center gap-1.5 text-secondary">
													<UserIcon class="w-3 h-3" />
													<span class="font-medium">{ann.userId}</span>
												</div>
												<Badge
													size="sm"
													variant={
														ann.decision === "accepted"
															? "success"
															: ann.decision === "rejected"
																? "danger"
																: "warning"
													}
												>
													{ann.decision}
												</Badge>
											</div>
											<Show when={ann.tags && ann.tags.length > 0}>
												<div class="flex flex-wrap gap-1 mt-0.5">
													<For each={ann.tags}>
														{(tag) => (
															<span class="px-1.5 py-0.2 rounded bg-surface text-tertiary ts-caption border border-border/40">
																{tag}
															</span>
														)}
													</For>
												</div>
											</Show>
											<Show when={ann.notes}>
												<p class="text-secondary italic mt-0.5">
													{ann.notes}
												</p>
											</Show>
											<div class="flex items-center gap-1 text-tertiary ts-caption mt-0.5">
												<Clock class="w-2.5 h-2.5" />
												<span>
													{new Date(ann.createdAt).toLocaleString()}
												</span>
											</div>
										</div>
									)}
								</For>
							</div>
						</Show>
					</div>
				</div>
			</div>
		</div>
	);
}
