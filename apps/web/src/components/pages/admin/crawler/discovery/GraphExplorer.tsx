import { createSignal, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import { createRequestSequence } from "../videoActions";
import type { RecommendationGraphResponse, RecommendationGraphNode } from "@cvsa/contracts";
import ExternalLink from "lucide-solid/icons/external-link";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Plus from "lucide-solid/icons/plus";
import Compass from "lucide-solid/icons/compass";

type GraphExplorerProps = {
	onIngestSuccess?: () => void;
};

type GraphNodeActions = {
	ingesting: boolean;
	onIngest: (node: RecommendationGraphNode) => void;
	onExpand: (node: RecommendationGraphNode) => void;
};

function NodeCover(props: { node: RecommendationGraphNode; seed?: boolean }) {
	const t = getComponentT("crawler");
	const duration = () => {
		const seconds = props.node.duration;
		return seconds
			? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`
			: "--:--";
	};
	return (
		<div
			class={
				props.seed
					? "relative w-24 h-16 shrink-0 bg-surface-container-high"
					: "relative w-20 h-14 shrink-0 bg-surface-container-high"
			}
		>
			<Show
				when={props.node.pic}
				fallback={<span class="ts-caption text-tertiary">{t("graphUi.noCover")}</span>}
			>
				{(pic) => (
					<img
						src={pic()}
						alt={props.node.title}
						class="w-full h-full object-cover"
						loading="lazy"
						referrerPolicy="no-referrer"
					/>
				)}
			</Show>
			<Show when={props.node.duration}>
				<span class="absolute bottom-1 right-1 px-1 bg-surface text-overline tracking-overline text-primary">
					{duration()}
				</span>
			</Show>
		</div>
	);
}

function GraphNodeCard(
	props: GraphNodeActions & { node: RecommendationGraphNode; seed?: boolean }
) {
	const t = getComponentT("crawler");
	return (
		<article
			class={
				props.seed
					? "p-4 border border-primary bg-surface flex flex-col gap-3"
					: "p-3 bg-surface flex flex-col justify-between gap-3"
			}
		>
			<div class="flex items-start gap-3">
				<NodeCover node={props.node} seed={props.seed} />
				<div class="flex flex-col gap-1 min-w-0">
					<div class="flex items-center gap-2 ts-caption text-tertiary">
						<Show when={props.seed}>
							<Badge size="sm">{t("graphUi.seed")}</Badge>
						</Show>
						<Show when={props.node.position}>
							<span>#{props.node.position}</span>
						</Show>
						<span>{props.node.bvid}</span>
					</div>
					<a
						href={`https://www.bilibili.com/video/${props.node.bvid}`}
						target="_blank"
						rel="noopener noreferrer"
						class="text-label tracking-label font-medium text-primary hover:underline line-clamp-2"
					>
						{props.node.title}
						<ExternalLink class="inline w-3 h-3 ml-1" />
					</a>
					<Show when={props.node.ownerName}>
						<span class="ts-caption text-secondary">
							{t("graphUi.uploader").replace("{name}", props.node.ownerName ?? "")}
						</span>
					</Show>
				</div>
			</div>
			<div class="flex items-center justify-between gap-2">
				<Show
					when={props.node.isTracked}
					fallback={
						<Button
							size="sm"
							variant="outlined"
							disabled={props.ingesting}
							onClick={() => props.onIngest(props.node)}
						>
							<Plus class="w-3.5 h-3.5" />
							{t("graphUi.ingest")}
						</Button>
					}
				>
					<Badge variant="success" size="sm">
						{t("graphUi.tracked")}
					</Badge>
				</Show>
				<Show when={!props.seed}>
					<Button size="sm" variant="outlined" onClick={() => props.onExpand(props.node)}>
						{t("graphUi.expand")}
						<ArrowRight class="w-3 h-3" />
					</Button>
				</Show>
			</div>
		</article>
	);
}

function GraphResults(props: GraphNodeActions & { graph: RecommendationGraphResponse }) {
	const t = getComponentT("crawler");
	return (
		<div class="flex flex-col gap-4">
			<GraphNodeCard
				node={props.graph.seed}
				seed
				ingesting={props.ingesting}
				onIngest={props.onIngest}
				onExpand={props.onExpand}
			/>
			<div class="flex items-center justify-between gap-3 ts-caption">
				<h4 class="font-semibold">
					{t("graphUi.relations")} ({props.graph.relations.length})
				</h4>
				<span class="text-tertiary">{t("graphUi.expandHelp")}</span>
			</div>
			<Show
				when={props.graph.relations.length}
				fallback={
					<p class="p-8 text-center text-tertiary ts-caption">{t("graphUi.empty")}</p>
				}
			>
				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
					<For each={props.graph.relations}>
						{(node) => (
							<GraphNodeCard
								node={node}
								ingesting={props.ingesting}
								onIngest={props.onIngest}
								onExpand={props.onExpand}
							/>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

export default function GraphExplorer(props: GraphExplorerProps) {
	const t = getComponentT("crawler");
	const [identifier, setIdentifier] = createSignal("");
	const requests = createRequestSequence();
	const [loading, setLoading] = createSignal(false);
	const [graph, setGraph] = createSignal<RecommendationGraphResponse | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [ingestingAid, setIngestingAid] = createSignal<string | null>(null);

	const searchGraph = async (idToSearch?: string) => {
		const target = (idToSearch ?? identifier()).trim();
		if (!target) {
			toast.error(t("graphUi.identifier"));
			return;
		}

		const request = requests.start();
		setLoading(true);
		setError(null);
		const res = await api.crawler.getRecommendationGraph(target);
		if (!requests.isCurrent(request)) return;
		setLoading(false);

		if (res.ok && res.data) {
			setGraph(res.data);
			setIdentifier(res.data.seed.bvid);
			return;
		}

		const errMsg = res.ok ? t("graphUi.notFound") : res.error.message || t("graphUi.failed");
		setError(errMsg);
		toast.error(errMsg);
	};

	const quickIngest = async (bvid: string, aid: string) => {
		if (ingestingAid()) return;
		setIngestingAid(aid);
		const res = await api.crawler.ingestVideo({
			identifier: bvid,
			state: "regular",
			priority: 2,
		});
		setIngestingAid(null);

		if (res.ok && res.data) {
			toast.success(`${t("graphUi.ingested")}: ${res.data.title}`);
			setGraph((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					seed: prev.seed.aid === aid ? { ...prev.seed, isTracked: true } : prev.seed,
					relations: prev.relations.map((node) =>
						node.aid === aid ? { ...node, isTracked: true } : node
					),
				};
			});
			props.onIngestSuccess?.();
			return;
		}

		toast.error(
			res.ok ? t("graphUi.ingestFailed") : res.error.message || t("graphUi.ingestFailed")
		);
	};

	return (
		<section class="flex flex-col gap-6">
			<h3 class="ts-heading-3 text-primary">{t("graphUi.title")}</h3>
			<form
				class="flex items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					void searchGraph();
				}}
			>
				<TextField
					class="flex-1"
					placeholder={t("graphUi.input")}
					value={identifier()}
					onInput={(event) => setIdentifier(event.currentTarget.value)}
					disabled={loading()}
				/>
				<Button type="submit" variant="filled" disabled={loading() || !identifier().trim()}>
					<Compass class="w-4 h-4" />
					{loading() ? t("graphUi.searching") : t("graphUi.search")}
				</Button>
			</form>
			<Show when={error()}>
				{(message) => (
					<div role="alert" class="p-3 bg-error text-on-error ts-caption font-medium">
						{message()}
					</div>
				)}
			</Show>
			<Show when={graph()}>
				{(current) => (
					<GraphResults
						graph={current()}
						ingesting={ingestingAid() !== null}
						onIngest={(node) => void quickIngest(node.bvid, node.aid)}
						onExpand={(node) => void searchGraph(node.bvid)}
					/>
				)}
			</Show>
		</section>
	);
}
