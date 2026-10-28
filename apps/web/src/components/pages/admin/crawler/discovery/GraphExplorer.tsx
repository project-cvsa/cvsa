import { createSignal, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import TextField from "@components/ui/TextField";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type { RecommendationGraphResponse } from "@cvsa/contracts";
import ExternalLink from "lucide-solid/icons/external-link";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Plus from "lucide-solid/icons/plus";
import Compass from "lucide-solid/icons/compass";

type GraphExplorerProps = {
	onIngestSuccess?: () => void;
};

export default function GraphExplorer(props: GraphExplorerProps) {
	const [identifier, setIdentifier] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [graph, setGraph] = createSignal<RecommendationGraphResponse | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [ingestingAid, setIngestingAid] = createSignal<string | null>(null);

	const searchGraph = async (idToSearch?: string) => {
		const target = (idToSearch ?? identifier()).trim();
		if (!target) {
			toast.error("请输入要查询的视频标识");
			return;
		}

		setLoading(true);
		setError(null);
		const res = await api.crawler.getRecommendationGraph(target);
		setLoading(false);

		if (res.ok && res.data) {
			setGraph(res.data);
			setIdentifier(res.data.seed.bvid);
			return;
		}

		const errMsg = res.ok ? "未找到该视频或相关图谱" : res.error.message || "推荐图谱查询失败";
		setError(errMsg);
		toast.error(errMsg);
	};

	const quickIngest = async (bvid: string, aid: string) => {
		setIngestingAid(aid);
		const res = await api.crawler.ingestVideo({
			identifier: bvid,
			state: "regular",
			priority: 2,
		});
		setIngestingAid(null);

		if (res.ok && res.data) {
			toast.success(`成功收录并开启追踪: ${res.data.title}`);
			setGraph((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					relations: prev.relations.map((node) =>
						node.aid === aid ? { ...node, isTracked: true } : node
					),
				};
			});
			props.onIngestSuccess?.();
			return;
		}

		toast.error(res.ok ? "收录失败" : res.error.message || "收录失败");
	};

	const formatDuration = (seconds?: number) => {
		if (!seconds) return "--:--";
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, "0")}`;
	};

	return (
		<Card>
			<CardHeader title="推荐拓扑" description="查询视频在推荐系统中的关联网络与收录状态" />
			<CardContent class="flex flex-col gap-6">
				{/* Search Input Bar */}
				<div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
					<div class="flex-1 max-w-lg">
						<TextField
							label="视频 BVID 或 AID"
							value={identifier()}
							onInput={(e) => setIdentifier(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									void searchGraph();
								}
							}}
							disabled={loading()}
						/>
					</div>

					<Button
						variant="filled"
						disabled={loading() || !identifier().trim()}
						onClick={() => void searchGraph()}
						class="h-[58px] px-6 gap-2 shrink-0"
					>
						<Compass class={"w-4 h-4 " + (loading() ? "animate-spin" : "")} />
						<span>{loading() ? "查询中..." : "查询拓扑"}</span>
					</Button>
				</div>

				{/* Error State */}
				<Show when={error()}>
					<div class="p-3 border border-error bg-surface text-error text-xs">
						{error()}
					</div>
				</Show>

				{/* Graph Results */}
				<Show when={graph()}>
					{(current) => (
						<div class="flex flex-col gap-6">
							{/* Seed Video Node */}
							<div class="p-4 border border-primary bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
								<div class="flex items-center gap-4 min-w-0">
									<Show
										when={current().seed.pic}
										fallback={
											<div class="w-24 h-16 bg-surface-container-high border border-border flex items-center justify-center text-xs text-tertiary shrink-0">
												无封面
											</div>
										}
									>
										{(pic) => (
											<div class="relative w-24 h-16 shrink-0 border border-border overflow-hidden bg-black">
												<img
													src={pic()}
													alt={current().seed.title}
													class="w-full h-full object-cover"
													loading="lazy"
													referrerPolicy="no-referrer"
												/>
												<Show when={current().seed.duration}>
													<span class="absolute bottom-1 right-1 px-1 bg-black/80 text-[10px] text-white">
														{formatDuration(current().seed.duration)}
													</span>
												</Show>
											</div>
										)}
									</Show>

									<div class="flex flex-col gap-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="text-xs font-medium px-1.5 py-0.5 bg-primary text-display-inverted">
												种子视频
											</span>
											<span class="text-xs text-tertiary">
												{current().seed.bvid} · av{current().seed.aid}
											</span>
										</div>
										<a
											href={`https://www.bilibili.com/video/${current().seed.bvid}`}
											target="_blank"
											rel="noopener noreferrer"
											class="font-medium text-sm text-primary hover:underline truncate max-w-xl inline-flex items-center gap-1.5"
										>
											<span class="truncate">{current().seed.title}</span>
											<ExternalLink class="w-3.5 h-3.5 text-tertiary shrink-0" />
										</a>
										<Show when={current().seed.ownerName}>
											<span class="text-xs text-secondary">
												UP: {current().seed.ownerName}
											</span>
										</Show>
									</div>
								</div>

								<div class="flex items-center gap-2 shrink-0">
									<Show
										when={current().seed.isTracked}
										fallback={
											<Button
												size="sm"
												variant="outlined"
												disabled={ingestingAid() === current().seed.aid}
												onClick={() =>
													void quickIngest(
														current().seed.bvid,
														current().seed.aid
													)
												}
												class="gap-1 text-xs"
											>
												<Plus class="w-3.5 h-3.5" />
												<span>收录此视频</span>
											</Button>
										}
									>
										<Badge variant="success" size="sm" dot>
											已在追踪库
										</Badge>
									</Show>
								</div>
							</div>

							{/* Related Target Nodes */}
							<div class="flex flex-col gap-3">
								<div class="flex items-center justify-between">
									<h4 class="text-xs font-semibold text-primary">
										关联推荐 ({current().relations.length} 个视频)
									</h4>
									<span class="text-xs text-tertiary">
										点击「沿此扩散」以此视频为种子继续探索
									</span>
								</div>

								<Show
									when={current().relations.length > 0}
									fallback={
										<div class="p-8 text-center text-tertiary border border-border text-xs">
											该视频暂无关联推荐数据
										</div>
									}
								>
									<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
										<For each={current().relations}>
											{(node) => (
												<div class="p-3 border border-border bg-surface flex flex-col justify-between gap-3 group hover:border-tertiary transition-colors">
													<div class="flex items-start gap-3">
														<Show
															when={node.pic}
															fallback={
																<div class="w-20 h-14 bg-surface-container-high border border-border flex items-center justify-center text-[10px] text-tertiary shrink-0">
																	无封面
																</div>
															}
														>
															{(pic) => (
																<div class="relative w-20 h-14 shrink-0 border border-border overflow-hidden bg-black">
																	<img
																		src={pic()}
																		alt={node.title}
																		class="w-full h-full object-cover"
																		loading="lazy"
																		referrerPolicy="no-referrer"
																	/>
																	<Show when={node.duration}>
																		<span class="absolute bottom-0.5 right-0.5 px-1 bg-black/80 text-[9px] text-white">
																			{formatDuration(
																				node.duration
																			)}
																		</span>
																	</Show>
																</div>
															)}
														</Show>

														<div class="flex flex-col gap-1 min-w-0 flex-1">
															<div class="flex items-center gap-1.5">
																<Show when={node.position}>
																	<span class="text-[10px] px-1 bg-surface-container-high border border-border text-tertiary">
																		#{node.position}
																	</span>
																</Show>
																<span class="text-[10px] text-tertiary truncate">
																	{node.bvid}
																</span>
															</div>
															<a
																href={`https://www.bilibili.com/video/${node.bvid}`}
																target="_blank"
																rel="noopener noreferrer"
																class="font-medium text-xs text-primary hover:underline line-clamp-2 leading-tight"
																title={node.title}
															>
																{node.title}
															</a>
															<Show when={node.ownerName}>
																<span class="text-[11px] text-tertiary truncate">
																	UP: {node.ownerName}
																</span>
															</Show>
														</div>
													</div>

													<div class="flex items-center justify-between pt-2 border-t border-border">
														<div>
															<Show
																when={node.isTracked}
																fallback={
																	<Button
																		size="sm"
																		variant="ghost"
																		disabled={
																			ingestingAid() ===
																			node.aid
																		}
																		onClick={() =>
																			void quickIngest(
																				node.bvid,
																				node.aid
																			)
																		}
																		class="gap-1 text-xs h-7 px-2"
																	>
																		<Plus class="w-3 h-3" />
																		<span>收录</span>
																	</Button>
																}
															>
																<Badge
																	variant="success"
																	size="sm"
																	dot
																>
																	已追踪
																</Badge>
															</Show>
														</div>

														<Button
															size="sm"
															variant="outlined"
															onClick={() =>
																void searchGraph(node.bvid)
															}
															class="gap-1 text-xs h-7 px-2"
														>
															<span>沿此扩散</span>
															<ArrowRight class="w-3 h-3" />
														</Button>
													</div>
												</div>
											)}
										</For>
									</div>
								</Show>
							</div>
						</div>
					)}
				</Show>
			</CardContent>
		</Card>
	);
}
