import { createSignal, Show } from "solid-js";
import Button from "@components/ui/Button";
import Modal from "@components/ui/Modal";
import TextField from "@components/ui/TextField";
import { RadioGroup, type RadioOption } from "@components/ui/Radio";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";
import type { IngestVideoResponse } from "@cvsa/contracts";
import Plus from "lucide-solid/icons/plus";
import CheckCircle from "lucide-solid/icons/check-circle";

interface ManualIngestModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess?: (result: IngestVideoResponse) => void;
}

export default function ManualIngestModal(props: ManualIngestModalProps) {
	const t = getComponentT("crawler");

	const [identifier, setIdentifier] = createSignal("");
	const [mode, setMode] = createSignal<"new" | "regular" | "milestone" | "archive">("regular");
	const [submitting, setSubmitting] = createSignal(false);
	const [ingestResult, setIngestResult] = createSignal<IngestVideoResponse | null>(null);

	const modeOptions: RadioOption<"new" | "regular" | "milestone" | "archive">[] = [
		{
			value: "new",
			label: "新投稿 / 爆发期 (New)",
			description: "新投稿或爆款盯盘，以极高频次（分钟级）密集采样",
		},
		{
			value: "regular",
			label: "常规盯盘 (Regular)",
			description: "根据播放增速自动计算下一次采样间隔（基准周期）",
		},
		{
			value: "milestone",
			label: "里程碑关注 (Milestone)",
			description: "即将突破 10万/100万 时优先调度保障数据密度",
		},
		{
			value: "archive",
			label: "历史归档 (Archive)",
			description: "低频长期存档采样，降低爬虫压力",
		},
	];

	const handleIngest = async (e: SubmitEvent) => {
		e.preventDefault();
		const raw = identifier().trim();
		if (!raw) {
			toast.error("请输入 BVID (如 BV1xx...) 或 AID");
			return;
		}

		setSubmitting(true);
		setIngestResult(null);

		const res = await api.crawler.ingestVideo({
			identifier: raw,
			state: mode(),
			priority: mode() === "new" ? 1 : 2,
		});

		setSubmitting(false);

		if (res.ok && res.data) {
			setIngestResult(res.data);
			toast.success(
				res.data.alreadyTracked
					? `视频 ${res.data.bvid} 已在库中，已更新追踪状态`
					: `成功收录视频: ${res.data.title}`
			);
			props.onSuccess?.(res.data);
			return;
		}

		toast.error(
			res.ok ? t("common.error") : res.error.message || "收录失败，请检查视频是否存在"
		);
	};

	const resetAndClose = () => {
		setIdentifier("");
		setIngestResult(null);
		props.onClose();
	};

	return (
		<Modal
			isOpen={props.isOpen}
			onClose={resetAndClose}
			size="lg"
			title="手动收录视频 (Manual Video Ingest)"
			description="直接将 B 站视频载入 CVSA 追踪系统并立即建立时序采样管道"
		>
			<div class="flex flex-col gap-6">
				<form onSubmit={handleIngest} class="flex flex-col gap-5">
					<TextField
						label="视频标识符 (BVID 或 AID)"
						helperText="支持以 BV1... 开头的视频号或纯数字 AID，如 BV1xx411c7mD"
						value={identifier()}
						onInput={(e) => setIdentifier(e.currentTarget.value)}
						disabled={submitting()}
						required
					/>

					<RadioGroup
						label="初始追踪策略"
						value={mode()}
						onChange={(val) =>
							setMode(val as "new" | "regular" | "milestone" | "archive")
						}
						options={modeOptions}
						disabled={submitting()}
					/>

					<div class="flex items-center justify-end gap-3 pt-2 border-t border-border">
						<Button
							type="button"
							variant="outlined"
							onClick={resetAndClose}
							disabled={submitting()}
						>
							取消
						</Button>
						<Button
							type="submit"
							variant="filled"
							disabled={submitting() || !identifier().trim()}
							class="gap-1.5"
						>
							<Plus class="w-4 h-4" />
							<span>{submitting() ? "解析与入库中..." : "立即收录"}</span>
						</Button>
					</div>
				</form>

				{/* Ingest Result Preview */}
				<Show when={ingestResult()}>
					{(item) => (
						<div class="p-4 border-2 border-primary bg-surface-container-high flex flex-col gap-3">
							<div class="flex items-center gap-2 text-primary font-semibold text-sm">
								<CheckCircle class="w-4 h-4 text-primary" />
								<span>
									{item().alreadyTracked ? "已在库中，已更新" : "新收录成功"}
								</span>
							</div>

							<div class="flex items-start gap-4">
								<Show when={item().pic}>
									{(pic) => (
										<img
											src={pic()}
											alt={item().title}
											class="w-28 h-18 object-cover border border-border shrink-0"
										/>
									)}
								</Show>
								<div class="flex flex-col gap-1 min-w-0">
									<a
										href={`https://www.bilibili.com/video/${item().bvid}`}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-primary hover:underline line-clamp-2 text-sm"
									>
										{item().title}
									</a>
									<div class="flex items-center gap-2 ts-caption text-secondary">
										<span>{item().bvid}</span>
										<span>·</span>
										<span>UP: {item().ownerName ?? "未知"}</span>
										<span>·</span>
										<span>状态: {item().state}</span>
									</div>
								</div>
							</div>
						</div>
					)}
				</Show>
			</div>
		</Modal>
	);
}
