import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	AkariWorkerReplySchema,
	type AkariWorkerReply,
	type AkariWorkerRequest,
} from "@cvsa/contracts";
import { boundedOperation } from "../crawler/shared/boundedOperation";
import { getTaskSignal } from "../crawler/shared/taskContext";
import type { AkariClassificationInput, AkariPrediction, AkariHealth } from "./akari";

function defaultWorkerUrl(): URL {
	const jsUrl = new URL("./akariWorker.js", import.meta.url);
	try {
		if (existsSync(fileURLToPath(jsUrl))) return jsUrl;
	} catch {}
	return new URL("./akariWorker.ts", import.meta.url);
}

/** One native inference process, replaced on cancellation or timeout. */
export class IsolatedAkariClassifier {
	private child: ChildProcess | undefined;
	private sequence = 0;
	private tail: Promise<unknown> = Promise.resolve();
	private active: { id: number; reject: (error: Error) => void } | undefined;
	private closed = false;
	constructor(
		private readonly timeoutMs: () => number = () => 30000,
		private readonly workerUrl = defaultWorkerUrl()
	) {}
	private terminate(): void {
		const child = this.child;
		this.child = undefined;
		child?.kill("SIGKILL");
		this.active?.reject(new Error("Inference process stopped"));
		this.active = undefined;
	}
	close(): void {
		this.closed = true;
		this.terminate();
	}
	private process(): ChildProcess {
		if (this.closed) throw new Error("Classifier is closed");
		if (this.child) return this.child;
		const child = fork(fileURLToPath(this.workerUrl), [], {
			execPath: process.execPath,
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		this.child = child;
		child.on("error", () => {
			if (this.child === child) this.terminate();
		});
		child.on("exit", () => {
			if (this.child === child) this.terminate();
		});
		child.unref();
		return child;
	}
	private async run(request: AkariWorkerRequest): Promise<AkariWorkerReply> {
		const signal = getTaskSignal();
		let cancelled = false;
		const pending = this.tail
			.catch(() => {})
			.then(async () => {
				if (cancelled) throw new Error("Inference cancelled while queued");
				signal?.throwIfAborted();
				const child = this.process();
				return new Promise<AkariWorkerReply>((resolve, reject) => {
					const cleanup = () => {
						child.off("message", receive);
						if (this.active?.id === request.id) this.active = undefined;
					};
					const receive = (message: unknown) => {
						const reply = AkariWorkerReplySchema.safeParse(message);
						if (!reply.success || reply.data.id !== request.id) return;
						cleanup();
						if (reply.data.kind === "error") reject(new Error(reply.data.message));
						else resolve(reply.data);
					};
					this.active = {
						id: request.id,
						reject: (error) => {
							cleanup();
							reject(error);
						},
					};
					child.on("message", receive);
					child.send(request, (error) => {
						if (error) this.terminate();
					});
				});
			});
		this.tail = pending;
		try {
			return await boundedOperation(() => pending, this.timeoutMs(), signal);
		} catch (error) {
			cancelled = true;
			if (this.active?.id === request.id) this.terminate();
			throw error;
		}
	}
	async classify(input: AkariClassificationInput): Promise<AkariPrediction | null> {
		const reply = await this.run({
			id: ++this.sequence,
			kind: "classify",
			input: {
				title: input.title,
				description: input.description,
				tags:
					typeof input.tags === "string"
						? input.tags
						: input.tags
							? [...input.tags]
							: null,
			},
		});
		return reply.kind === "classify" ? reply.prediction : null;
	}
	async checkHealth(): Promise<AkariHealth> {
		const reply = await this.run({ id: ++this.sequence, kind: "health" });
		return reply.kind === "health"
			? reply.health
			: { status: "unreachable", modelLoaded: false };
	}
}
