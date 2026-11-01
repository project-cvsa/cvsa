import { createSignal } from "solid-js";
import Button from "@components/ui/Button";
import DateField from "@components/ui/DateField";
import NumberField from "@components/ui/NumberField";
import { toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import { getComponentT } from "@lib/i18n/isomorphic";

export default function DiscoveryActions(props: { onQueued: () => void }) {
	const t = getComponentT("crawler");
	const [pendingAction, setPendingAction] = createSignal<"incremental" | "range" | null>(null);

	const [lookbackDays, setLookbackDays] = createSignal(7);

	const todayStr = () => new Date().toISOString().slice(0, 10);
	const thirtyDaysAgoStr = () => {
		const d = new Date();
		d.setDate(d.getDate() - 30);
		return d.toISOString().slice(0, 10);
	};
	const [startDate, setStartDate] = createSignal<string | undefined>(thirtyDaysAgoStr());
	const [endDate, setEndDate] = createSignal<string | undefined>(todayStr());

	const triggerIncremental = async () => {
		if (pendingAction()) return;
		setPendingAction("incremental");
		const days = Math.max(1, lookbackDays() || 7);
		const result = await api.crawler.triggerSweep({
			mode: "incremental",
			timeWindowDays: days,
		});
		setPendingAction(null);
		if (result.ok) {
			toast.success(t("common.saved"));
			props.onQueued();
		} else {
			toast.error(result.error.message || t("common.error"));
		}
	};

	const triggerRangeSweep = async () => {
		if (pendingAction()) return;
		const start = startDate();
		const end = endDate();
		if (!start || !end) {
			toast.error(t("discoveryActions.missingDates"));
			return;
		}
		const startSec = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
		const endSec = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000);

		if (Number.isNaN(startSec) || Number.isNaN(endSec)) {
			toast.error(t("discoveryActions.invalidDates"));
			return;
		}
		if (startSec > endSec) {
			toast.error(t("discoveryActions.startDateAfterEndDate"));
			return;
		}

		setPendingAction("range");
		const result = await api.crawler.triggerSweep({
			mode: "incremental",
			from: startSec,
			to: endSec,
		});
		setPendingAction(null);
		if (result.ok) {
			toast.success(t("common.saved"));
			props.onQueued();
		} else {
			toast.error(result.error.message || t("common.error"));
		}
	};

	return (
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{/* 增量搜索 */}
			<div class="p-4 bg-surface border border-border flex flex-col gap-3">
				<span class="ts-label font-semibold text-primary">
					{t("discoveryActions.incremental")}
				</span>
				<div class="flex items-end gap-3">
					<div class="w-36 shrink-0">
						<NumberField
							size="sm"
							label={t("discoveryActions.lookbackDays")}
							min={1}
							max={365}
							suffix={t("discoveryActions.daysSuffix")}
							value={lookbackDays()}
							onChange={(val) => setLookbackDays(val)}
						/>
					</div>
					<Button
						size="sm"
						variant="filled"
						loading={pendingAction() === "incremental"}
						disabled={pendingAction() !== null}
						onClick={() => void triggerIncremental()}
					>
						{t("discoveryActions.runIncremental")}
					</Button>
				</div>
			</div>

			{/* 全关键词按时间段搜索 */}
			<div class="p-4 bg-surface border border-border flex flex-col gap-3">
				<span class="ts-label font-semibold text-primary">
					{t("discoveryActions.rangeSweep")}
				</span>
				<div class="flex flex-wrap items-end gap-3">
					<div class="w-44 shrink-0">
						<DateField
							size="sm"
							label={t("discoveryActions.startDate")}
							granularity="day"
							value={startDate()}
							onValueChange={setStartDate}
						/>
					</div>
					<div class="w-44 shrink-0">
						<DateField
							size="sm"
							label={t("discoveryActions.endDate")}
							granularity="day"
							value={endDate()}
							onValueChange={setEndDate}
						/>
					</div>
					<Button
						size="sm"
						variant="filled"
						loading={pendingAction() === "range"}
						disabled={pendingAction() !== null}
						onClick={() => void triggerRangeSweep()}
					>
						{t("discoveryActions.runRange")}
					</Button>
				</div>
			</div>
		</div>
	);
}
