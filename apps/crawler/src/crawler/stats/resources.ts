import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { StatsResourceProcess, StatsResourceState } from "./types";

const execFileAsync = promisify(execFile);

interface CpuSample {
	at: number;
	user: number;
	system: number;
}

export interface ProcessResourceReader {
	sample(pid: number): Promise<{ cpuPercent: number; rssBytes: number } | null>;
}

const posixResourceReader: ProcessResourceReader = {
	async sample(pid) {
		try {
			const { stdout } = await execFileAsync("ps", ["-o", "%cpu=,rss=", "-p", String(pid)]);
			const [cpu, rss] = stdout.trim().split(/\s+/).map(Number);
			if (!Number.isFinite(cpu) || !Number.isFinite(rss)) return null;
			return { cpuPercent: cpu, rssBytes: rss * 1024 };
		} catch {
			return null;
		}
	},
};

/**
 * Samples parent and model-process resource use. CPU is the delta of the
 * process CPU counters over wall time, where one fully busy core is 100%.
 */
export class ResourceSampler {
	private previous: CpuSample | undefined;
	private readonly delay = monitorEventLoopDelay({ resolution: 20 });

	constructor(
		private readonly parentId: string,
		private readonly modelPid: () => number | undefined,
		private readonly reader: ProcessResourceReader = posixResourceReader,
		private readonly clock: () => number = () => performance.now()
	) {
		this.delay.enable();
	}

	async sample(): Promise<StatsResourceState> {
		const now = this.clock();
		const usage = process.cpuUsage();
		const processes: StatsResourceProcess[] = [];
		if (this.previous) {
			const wallMs = Math.max(1, now - this.previous.at);
			const cpuMs =
				(usage.user - this.previous.user + usage.system - this.previous.system) / 1000;
			processes.push({
				id: this.parentId,
				role: "parent",
				cpuPercent: Math.max(0, (cpuMs / wallMs) * 100),
				rssBytes: process.memoryUsage().rss,
			});
		}
		this.previous = { at: now, user: usage.user, system: usage.system };
		const pid = this.modelPid();
		if (pid !== undefined) {
			const child = await this.reader.sample(pid);
			if (child) processes.push({ id: String(pid), role: "model", ...child });
		}
		this.delay.reset();
		return {
			sampledAt: new Date().toISOString(),
			processes,
			eventLoopDelayMs: this.delay.count > 0 ? this.delay.mean / 1_000_000 : null,
		};
	}

	close(): void {
		this.delay.disable();
	}
}
