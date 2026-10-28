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
import Music from "lucide-solid/icons/music";
import User from "lucide-solid/icons/user";
import Settings from "lucide-solid/icons/settings";

export function BadgeShowcase() {
	return (
		<div class="flex flex-wrap items-center gap-3">
			<Badge variant="default">默认</Badge>
			<Badge variant="neutral">中性</Badge>
			<Badge variant="success" dot>
				成功
			</Badge>
			<Badge variant="warning" dot>
				警告
			</Badge>
			<Badge variant="danger" dot>
				错误
			</Badge>
			<Badge variant="info">信息</Badge>
			<Badge variant="highlight">高亮</Badge>
			<Badge size="sm">小尺寸</Badge>
			<Badge size="md">中尺寸</Badge>
		</div>
	);
}

export function SliderShowcase() {
	const [val, setVal] = createSignal(45);
	const [threshold, setThreshold] = createSignal(70);

	return (
		<div class="flex flex-col gap-6 max-w-md">
			<Slider label="音量控制" value={val()} onChange={setVal} formatValue={(v) => `${v}%`} />
			<Slider
				label="判定阈值"
				min={0}
				max={100}
				step={5}
				value={threshold()}
				onChange={setThreshold}
				formatValue={(v) => `${(v / 100).toFixed(2)}`}
			/>
			<Slider label="禁用状态" disabled value={30} />
		</div>
	);
}

export function SwitchShowcase() {
	const [autoIngest, setAutoIngest] = createSignal(true);
	const [graphExpansion, setGraphExpansion] = createSignal(false);
	const [compactMode, setCompactMode] = createSignal(true);

	return (
		<div class="flex flex-col gap-4 max-w-md">
			<Switch
				checked={autoIngest()}
				onChange={setAutoIngest}
				label="自动收录"
				description="评分达标后自动进入追踪"
			/>
			<Switch
				checked={graphExpansion()}
				onChange={setGraphExpansion}
				label="关联推荐"
				description="周期性分析相关视频"
			/>
			<div class="flex items-center gap-6 pt-2">
				<Switch
					size="sm"
					checked={compactMode()}
					onChange={setCompactMode}
					label="小尺寸"
				/>
				<Switch
					size="md"
					checked={compactMode()}
					onChange={setCompactMode}
					label="标准尺寸"
				/>
			</div>
		</div>
	);
}

export function RadioShowcase() {
	const [trackSource, setTrackSource] = createSignal("all");
	const [speedPriority, setSpeedPriority] = createSignal("balance");

	return (
		<div class="flex flex-col gap-6 max-w-md">
			<RadioGroup
				label="来源筛选"
				value={trackSource()}
				onChange={setTrackSource}
				direction="col"
				options={[
					{ value: "all", label: "全部来源", description: "包含搜索与推荐" },
					{ value: "search", label: "仅搜索", description: "关键词匹配结果" },
					{ value: "graph", label: "仅推荐", description: "关联视频拓扑" },
				]}
			/>

			<RadioGroup
				label="调度优先级"
				value={speedPriority()}
				onChange={setSpeedPriority}
				direction="row"
				options={[
					{ value: "high", label: "高频" },
					{ value: "balance", label: "均衡" },
					{ value: "conservative", label: "低频" },
				]}
			/>
		</div>
	);
}

export function NumberFieldShowcase() {
	const [pages, setPages] = createSignal(2);
	const [minSec, setMinSec] = createSignal(45);

	return (
		<div class="flex flex-wrap items-end gap-6 max-w-lg">
			<div class="w-40">
				<NumberField
					label="抓取深度"
					min={1}
					max={20}
					step={1}
					value={pages()}
					onChange={setPages}
					suffix="页"
				/>
			</div>
			<div class="w-48">
				<NumberField
					label="最短时长"
					min={10}
					max={3600}
					step={5}
					value={minSec()}
					onChange={setMinSec}
					suffix="秒"
					helperText="小于此时长过滤排除"
				/>
			</div>
		</div>
	);
}

export function TabsShowcase() {
	const [tab, setTab] = createSignal("music");

	return (
		<div class="flex flex-col gap-4">
			<Tabs
				value={tab()}
				onChange={setTab}
				items={[
					{ id: "music", label: "曲目", icon: Music, count: 128 },
					{ id: "artists", label: "创作者", icon: User, count: 42 },
					{ id: "settings", label: "设置", icon: Settings },
				]}
			/>
		</div>
	);
}

export function CardShowcase() {
	return (
		<div class="flex flex-col sm:flex-row gap-4">
			<Card class="flex-1">
				<CardHeader
					title="曲目详情"
					description="基础属性与分类"
					actions={
						<Button
							size="sm"
							variant="filled"
							class="bg-surface text-primary border-transparent"
						>
							操作
						</Button>
					}
				/>
				<CardContent class="p-4 text-xs text-secondary leading-relaxed">
					收录状态正常，关联视频已纳入日常采样。
				</CardContent>
			</Card>

			<Card class="flex-1">
				<CardHeader
					variant="bordered"
					title="采样指标"
					description="最近更新记录"
					actions={
						<Badge variant="neutral" size="sm">
							状态正常
						</Badge>
					}
				/>
				<CardContent class="p-4 text-xs text-secondary leading-relaxed">
					最新播放 124,580 次，增速保持稳定。
				</CardContent>
			</Card>
		</div>
	);
}

export function ModalShowcase() {
	const [isOpen, setIsOpen] = createSignal(false);

	return (
		<div>
			<Button variant="outlined" size="md" onClick={() => setIsOpen(true)}>
				打开对话框
			</Button>

			<Modal
				isOpen={isOpen()}
				onClose={() => setIsOpen(false)}
				title="曲目收录确认"
				description="确认是否将该视频作为原创曲目纳入档案库追踪"
				footer={
					<div class="flex items-center justify-end gap-3 w-full">
						<Button variant="outlined" size="sm" onClick={() => setIsOpen(false)}>
							取消
						</Button>
						<Button variant="filled" size="sm" onClick={() => setIsOpen(false)}>
							确认收录
						</Button>
					</div>
				}
			>
				<div class="flex flex-col gap-3 py-2 text-sm text-secondary">
					<p>
						视频标识：
						<span class="text-primary font-medium">BV1xx411c7mD</span>
					</p>
					<p>
						标题：
						<span class="text-primary font-medium">【洛天依原创】尘降【PV付】</span>
					</p>
					<p>
						AI 判定置信度：
						<span class="text-primary font-bold">98.4%</span>
					</p>
				</div>
			</Modal>
		</div>
	);
}
