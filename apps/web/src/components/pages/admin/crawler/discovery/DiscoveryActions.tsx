import { createSignal } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import Search from "lucide-solid/icons/search";
import Layers from "lucide-solid/icons/layers";

export default function DiscoveryActions(props: { onQueued: () => void }) {
	const t = getComponentT("crawler");
	const [pendingMode, setPendingMode] = createSignal<"incremental" | "deep" | null>(null);

	const trigger = async (mode: "incremental" | "deep") => {
		if (pendingMode()) return;
		setPendingMode(mode);
		const result = await api.crawler.triggerSweep({ mode });
		setPendingMode(null);
		if (result.ok) {
			toast.success(mode === "deep" ? "已提交全网深度挖掘任务" : "已提交增量时间窗轮巡任务");
			props.onQueued();
		} else {
			toast.error(result.error.message || t("common.error"));
		}
	};

	return (
		<section aria-label="触发探索扫描" class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<h3 class="ts-heading-3 text-primary">触发探索扫描</h3>
				<span class="ts-caption text-tertiary">
					手动触发后台探索任务，无需等待定时轮巡计划
				</span>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{/* Incremental Sweep Card */}
				<div class="border border-border bg-surface p-4 flex flex-col justify-between gap-4">
					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-2 text-primary font-medium ts-body">
							<Search class="w-4 h-4 text-primary" />
							<span>增量时间窗轮巡 (Incremental Sweep)</span>
						</div>
						<p class="ts-caption text-secondary">
							基于 10
							分钟时间槽账本，针对尚未扫描的时间窗口对最新发布视频进行增量收割，自动跳过已覆盖区间。
						</p>
					</div>

					<div class="flex items-center justify-between pt-2 border-t border-border">
						<span class="ts-caption text-tertiary">定时周期: 每 5 分钟自动执行</span>
						<Button
							size="sm"
							variant="filled"
							loading={pendingMode() === "incremental"}
							disabled={pendingMode() !== null}
							onClick={() => void trigger("incremental")}
						>
							立即增量轮巡
						</Button>
					</div>
				</div>

				{/* Deep Sweep Card */}
				<div class="border border-border bg-surface p-4 flex flex-col justify-between gap-4">
					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-2 text-primary font-medium ts-body">
							<Layers class="w-4 h-4 text-primary" />
							<span>全网深度挖掘 (Deep Sweep)</span>
						</div>
						<p class="ts-caption text-secondary">
							跨越 1 天、3 天、7 天、14 天与 30
							天时间切片，按播放量与全站综合热度进行全网广度挖掘，捕捉冷门与高潜好曲。
						</p>
					</div>

					<div class="flex items-center justify-between pt-2 border-t border-border">
						<span class="ts-caption text-tertiary">定时周期: 每 30 分钟自动执行</span>
						<Button
							size="sm"
							variant="outlined"
							loading={pendingMode() === "deep"}
							disabled={pendingMode() !== null}
							onClick={() => void trigger("deep")}
						>
							执行全网深度挖掘
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
