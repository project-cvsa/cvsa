import { createSignal } from "solid-js";
import Button from "@components/ui/Button";
import Badge from "@components/ui/Badge";
import Slider from "@components/ui/Slider";
import Switch from "@components/ui/Switch";
import { RadioGroup } from "@components/ui/Radio";
import NumberField from "@components/ui/NumberField";
import Tabs from "@components/ui/Tabs";
import { Card, CardHeader, CardContent } from "@components/ui/Card";
import Modal from "@components/ui/Modal";
import { getComponentT } from "@lib/i18n/isomorphic";
import Music from "lucide-solid/icons/music";
import User from "lucide-solid/icons/user";
import Settings from "lucide-solid/icons/settings";

export function BadgeShowcase() {
	const t = getComponentT("design-system");
	return (
		<div class="flex flex-wrap items-center gap-3">
			<Badge variant="default">{t("controls.default")}</Badge>
			<Badge variant="neutral">{t("controls.neutral")}</Badge>
			<Badge variant="success" dot>
				{t("controls.success")}
			</Badge>
			<Badge variant="warning" dot>
				{t("controls.warning")}
			</Badge>
			<Badge variant="danger" dot>
				{t("controls.danger")}
			</Badge>
			<Badge variant="info">{t("controls.info")}</Badge>
			<Badge variant="highlight">{t("controls.highlight")}</Badge>
			<Badge size="sm">{t("controls.small")}</Badge>
			<Badge size="md">{t("controls.medium")}</Badge>
		</div>
	);
}

export function SliderShowcase() {
	const t = getComponentT("design-system");
	const [val, setVal] = createSignal(45);
	const [threshold, setThreshold] = createSignal(70);

	return (
		<div class="flex flex-col gap-6 max-w-md">
			<Slider
				label={t("controls.volume")}
				value={val()}
				onChange={setVal}
				formatValue={(v) => `${v}%`}
			/>
			<Slider
				label={t("controls.threshold")}
				min={0}
				max={100}
				step={5}
				value={threshold()}
				onChange={setThreshold}
				formatValue={(v) => `${(v / 100).toFixed(2)}`}
			/>
			<Slider label={t("controls.disabled")} disabled value={30} />
		</div>
	);
}

export function SwitchShowcase() {
	const t = getComponentT("design-system");
	const [autoIngest, setAutoIngest] = createSignal(true);
	const [graphExpansion, setGraphExpansion] = createSignal(false);
	const [compactMode, setCompactMode] = createSignal(true);

	return (
		<div class="flex flex-col gap-4 max-w-md">
			<Switch
				checked={autoIngest()}
				onChange={setAutoIngest}
				label={t("controls.autoIngest")}
				description={t("controls.autoIngestHelp")}
			/>
			<Switch
				checked={graphExpansion()}
				onChange={setGraphExpansion}
				label={t("controls.related")}
				description={t("controls.relatedHelp")}
			/>
			<div class="flex items-center gap-6 pt-2">
				<Switch
					size="sm"
					checked={compactMode()}
					onChange={setCompactMode}
					label={t("controls.small")}
				/>
				<Switch
					size="md"
					checked={compactMode()}
					onChange={setCompactMode}
					label={t("controls.standard")}
				/>
			</div>
		</div>
	);
}

export function RadioShowcase() {
	const t = getComponentT("design-system");
	const [trackSource, setTrackSource] = createSignal("all");
	const [speedPriority, setSpeedPriority] = createSignal("balance");

	return (
		<div class="flex flex-col gap-6 max-w-md">
			<RadioGroup
				label={t("controls.source")}
				value={trackSource()}
				onChange={setTrackSource}
				direction="col"
				options={[
					{
						value: "all",
						label: t("controls.allSources"),
						description: t("controls.allSourcesHelp"),
					},
					{
						value: "search",
						label: t("controls.searchOnly"),
						description: t("controls.searchOnlyHelp"),
					},
					{
						value: "graph",
						label: t("controls.relatedOnly"),
						description: t("controls.relatedOnlyHelp"),
					},
				]}
			/>

			<RadioGroup
				label={t("controls.priority")}
				value={speedPriority()}
				onChange={setSpeedPriority}
				direction="row"
				options={[
					{ value: "high", label: t("controls.high") },
					{ value: "balance", label: t("controls.balanced") },
					{ value: "conservative", label: t("controls.low") },
				]}
			/>
		</div>
	);
}

export function NumberFieldShowcase() {
	const t = getComponentT("design-system");
	const [pages, setPages] = createSignal(2);
	const [minSec, setMinSec] = createSignal(45);

	return (
		<div class="flex flex-col gap-4">
			<div class="w-40">
				<NumberField
					label={t("controls.depth")}
					min={1}
					max={20}
					step={1}
					value={pages()}
					onChange={setPages}
					suffix={t("controls.page")}
				/>
			</div>
			<div class="w-48">
				<NumberField
					label={t("controls.minDuration")}
					min={10}
					max={3600}
					step={5}
					value={minSec()}
					onChange={setMinSec}
					suffix={t("controls.second")}
					helperText={t("controls.minDurationHelp")}
				/>
			</div>
		</div>
	);
}

export function TabsShowcase() {
	const t = getComponentT("design-system");
	const [tab, setTab] = createSignal("music");

	return (
		<div class="flex flex-col gap-4">
			<Tabs
				value={tab()}
				onChange={setTab}
				items={[
					{ id: "music", label: t("controls.songs"), icon: Music, count: 128 },
					{ id: "artists", label: t("controls.artists"), icon: User, count: 42 },
					{ id: "settings", label: t("controls.settings"), icon: Settings },
				]}
			/>
		</div>
	);
}

export function CardShowcase() {
	const t = getComponentT("design-system");
	return (
		<div class="flex flex-col sm:flex-row gap-4">
			<Card class="flex-1">
				<CardHeader
					title={t("controls.songDetails")}
					description={t("controls.songDetailsHelp")}
					actions={
						<Button
							size="sm"
							variant="filled"
							class="bg-surface text-primary border-transparent"
						>
							{t("controls.action")}
						</Button>
					}
				/>
				<CardContent class="p-4 text-xs text-secondary leading-relaxed">
					{t("controls.cardBody")}
				</CardContent>
			</Card>

			<Card class="flex-1">
				<CardHeader
					variant="bordered"
					title={t("controls.metrics")}
					description={t("controls.recentUpdates")}
					actions={
						<Badge variant="neutral" size="sm">
							{t("controls.healthy")}
						</Badge>
					}
				/>
				<CardContent class="p-4 text-xs text-secondary leading-relaxed">
					{t("controls.metricsBody")}
				</CardContent>
			</Card>
		</div>
	);
}

export function ModalShowcase() {
	const t = getComponentT("design-system");
	const [isOpen, setIsOpen] = createSignal(false);

	return (
		<div>
			<Button variant="outlined" size="md" onClick={() => setIsOpen(true)}>
				{t("controls.openDialog")}
			</Button>

			<Modal
				isOpen={isOpen()}
				onClose={() => setIsOpen(false)}
				closeLabel={t("controls.close")}
				title={t("controls.confirmTitle")}
				description={t("controls.confirmDescription")}
				footer={
					isOpen() ? (
						<div class="flex items-center justify-end gap-3 w-full">
							<Button variant="outlined" size="sm" onClick={() => setIsOpen(false)}>
								{t("controls.cancel")}
							</Button>
							<Button variant="filled" size="sm" onClick={() => setIsOpen(false)}>
								{t("controls.confirm")}
							</Button>
						</div>
					) : undefined
				}
			>
				<div class="flex flex-col gap-3 py-2 text-sm text-secondary">
					<p>
						{t("controls.videoId")}
						<span class="text-primary font-medium">BV1xx411c7mD</span>
					</p>
					<p>
						{t("controls.title")}
						<span class="text-primary font-medium">【洛天依原创】尘降【PV付】</span>
					</p>
					<p>
						{t("controls.confidence")}
						<span class="text-primary font-bold">98.4%</span>
					</p>
				</div>
			</Modal>
		</div>
	);
}
