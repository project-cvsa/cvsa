import { createSignal } from "solid-js";
import Button from "@components/ui/Button";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";

export default function DiscoveryActions(props: { onQueued: () => void }) {
	const t = getComponentT("crawler");
	const [pendingMode, setPendingMode] = createSignal<"incremental" | "deep" | null>(null);

	const trigger = async (mode: "incremental" | "deep") => {
		if (pendingMode()) return;
		setPendingMode(mode);
		const result = await api.crawler.triggerSweep({ mode });
		setPendingMode(null);
		if (result.ok) {
			toast.success(t("common.saved"));
			props.onQueued();
		} else {
			toast.error(result.error.message || t("common.error"));
		}
	};

	return (
		<div class="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-border">
			<span class="ts-label font-semibold text-primary">触发探索扫描</span>
			<div class="flex items-center gap-2">
				<Button
					size="sm"
					variant="filled"
					loading={pendingMode() === "incremental"}
					disabled={pendingMode() !== null}
					onClick={() => void trigger("incremental")}
				>
					立即增量轮巡
				</Button>
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
	);
}
