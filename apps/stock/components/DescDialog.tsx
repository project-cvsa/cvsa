import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import Link from "next/link";

export function DescDialog() {
	return (
		<Dialog>
			<DialogTrigger>说明</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="mb-2">关于本网站的Q&A</DialogTitle>
					<p>
						<span className="font-bold">Q: 这是什么网站？</span> <br />
						A:
						这是一个娱乐性质的数据展示网站，用于展示哔哩哔哩上中文虚拟歌手演唱的歌曲视频的播放量增长情况。
					</p>
					<p>
						<span className="font-bold">Q: 数据是从哪里来的？准确吗？</span> <br />
						A: 本网站及其展示的数据均由
						<Link href="https://space.bilibili.com/335075170" className="underline">
							中V档案馆
						</Link>
						提供，这是一个收集、整理与归档有关中V信息的企划。
						我们会尽力保证数据及时更新，但不保证数据绝对准确，也不保证没有遗漏。
					</p>
					<p>
						<span className="font-bold">Q: 视频对应的数字是什么？是播放量吗？</span>{" "}
						<br />
						A:
						每支视频右边展示的数字是其在24小时内的播放量增量。受限于数据采集与更新频率，这个增量并不是绝对精准的实际值。
					</p>
					<p>
						<span className="font-bold">Q: “中V指数”是什么？它是如何计算的？</span>{" "}
						<br />
						A:
						我们参考现实世界中的股票指数，取日播放增长最多的100支视频，将其日增量求和，再除以一个缩放因子（目前是1,000）后得到“中V指数”。
						这个数字可以大致反应当前中V视频在哔哩哔哩上的整体热度趋势，但其公式背后并没有严谨的方法论。因此，该数值仅供娱乐。
					</p>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}
