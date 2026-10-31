import type {
	BilibiliVideoMetadata,
	BilibiliVideoMetadataHistory,
	BilibiliVideoRelation,
	DiscoverySample,
	Temporal,
	VideoTracking,
} from "@cvsa/snapshot-db";
import { DiscoveryContextSchema } from "@cvsa/contracts";
import { toInstant, toJson } from "@cvsa/snapshot-db";
import type { JobType, JobsOptions } from "bullmq";
import type { IDiscoveryRepository } from "../discovery/repository.interface";
import type { DiscoveryFilterConfigStore } from "../discovery/filter";
import type {
	HotSampleOptions,
	ListDiscoverySamplesOptions,
	RelationEdge,
	UpsertDiscoverySampleInput,
	UpsertMetadataInput,
} from "../discovery/types";
import type {
	CrawlerJobCounts,
	CrawlerMq,
	CrawlerProcessor,
	CrawlerQueue,
	CrawlerQueueJobSnapshot,
	CrawlerWorker,
} from "../shared/types";
import type {
	ITrackingRepository,
	ListTrackingVideosParams,
	ListTrackingVideosResult,
	OverdueTrackingSummary,
	UpdateScheduleInput,
	UpsertTrackingInput,
} from "../tracking/repository.interface";
import type { TrackingState } from "../tracking/types";

export interface FakeMqState {
	connected: boolean;
	closed: boolean;
	queuedJobs: FakeMqJob[];
	workerNames: string[];
	/** Counts returned by `getJobCounts`; tests mutate this to simulate depth. */
	jobCounts: CrawlerJobCounts;
	/** Default job options each queue was created with. */
	queueOptions: Record<string, JobsOptions>;
}

/** One queued job, shaped closely enough to the BullMQ job for admin read models. */
export interface FakeMqJob {
	/** Queue-scoped identifier, matching the BullMQ contract for `getJobDetail`. */
	id: string;
	queue: string;
	name: string;
	data: unknown;
	state: JobType;
	attempts: number;
	failedReason: string | null;
	timestamp: number;
	progress: unknown;
	processedOn: number | null;
	finishedOn: number | null;
	opts: JobsOptions | undefined;
	stacktrace: string[] | null;
	returnvalue?: unknown;
}

function isCountsOverride(counts: CrawlerJobCounts): boolean {
	return Object.values(counts).some((value) => value > 0);
}

function countJobs(jobs: readonly FakeMqJob[]): CrawlerJobCounts {
	const counts: CrawlerJobCounts = {
		waiting: 0,
		active: 0,
		delayed: 0,
		failed: 0,
		completed: 0,
	};
	for (const job of jobs) {
		switch (job.state) {
			case "waiting":
				counts.waiting += 1;
				break;
			case "active":
				counts.active += 1;
				break;
			case "delayed":
				counts.delayed += 1;
				break;
			case "failed":
				counts.failed += 1;
				break;
			case "completed":
				counts.completed += 1;
				break;
			default:
				break;
		}
	}
	return counts;
}

function jobSnapshot(job: FakeMqJob): CrawlerQueueJobSnapshot {
	return {
		id: job.id,
		name: job.name,
		data: job.data,
		state: job.state,
		attempts: job.attempts,
		failedReason: job.failedReason,
		timestamp: job.timestamp,
		progress: job.progress,
		processedOn: job.processedOn,
		finishedOn: job.finishedOn,
	};
}

export function createFakeMq(): CrawlerMq & { state: FakeMqState } {
	const state: FakeMqState = {
		connected: false,
		closed: false,
		queuedJobs: [],
		workerNames: [],
		jobCounts: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
		queueOptions: {},
	};

	return {
		state,
		async connect(): Promise<void> {
			state.connected = true;
		},
		createQueue<T>(name: string, options: JobsOptions = {}): CrawlerQueue<T> {
			state.queueOptions[name] = options;
			const queueJobs = (): FakeMqJob[] =>
				state.queuedJobs.filter((job) => job.queue === name);
			return {
				async add(jobName: string, data: T, jobOptions: JobsOptions = {}): Promise<void> {
					// BullMQ merges per-add options over the queue's default options.
					const effectiveOptions: JobsOptions = { ...options, ...jobOptions };
					// Queue-scoped ids mirror BullMQ, where a job id is only unique
					// inside its own queue.
					state.queuedJobs.push({
						id: String(queueJobs().length + 1),
						queue: name,
						name: jobName,
						data,
						state:
							effectiveOptions.delay !== undefined && effectiveOptions.delay > 0
								? "delayed"
								: "waiting",
						attempts: 0,
						failedReason: null,
						timestamp: Date.now(),
						progress: undefined,
						processedOn: null,
						finishedOn: null,
						opts: effectiveOptions,
						stacktrace: null,
					});
				},
				async getJobCounts(): Promise<CrawlerJobCounts> {
					// A test can overwrite `jobCounts` to simulate backlog depth; while it
					// holds the zero default the fake reports what it actually queued.
					return isCountsOverride(state.jobCounts)
						? { ...state.jobCounts }
						: countJobs(queueJobs());
				},
				async getJobs(
					states: JobType[] = ["active", "waiting", "delayed", "failed"],
					limit = 50,
					offset = 0
				): Promise<CrawlerQueueJobSnapshot[]> {
					if (limit <= 0) return [];
					const wanted = new Set<string>(states);
					// Insertion order, like reading a queue from its oldest entry.
					return queueJobs()
						.filter((job) => wanted.has(job.state))
						.slice(Math.max(0, offset), Math.max(0, offset) + limit)
						.map(jobSnapshot);
				},
				async getJobDetail(id: string) {
					const job = queueJobs().find((candidate) => candidate.id === id);
					if (!job) return null;
					return {
						...jobSnapshot(job),
						opts: job.opts,
						stacktrace: job.stacktrace,
						returnvalue: job.returnvalue,
					};
				},
				async retryJob(id: string) {
					const job = queueJobs().find((candidate) => candidate.id === id);
					if (job?.state !== "failed") return false;
					job.state = "waiting";
					job.failedReason = null;
					return true;
				},
				async removeJob(id: string) {
					const index = state.queuedJobs.findIndex(
						(candidate) => candidate.queue === name && candidate.id === id
					);
					if (index < 0) return false;
					state.queuedJobs.splice(index, 1);
					return true;
				},
				async close(): Promise<void> {},
			};
		},
		createWorker<T>(name: string, _processor: CrawlerProcessor<T>): CrawlerWorker {
			state.workerNames.push(name);
			return { async close(): Promise<void> {} };
		},
		async close(): Promise<void> {
			state.closed = true;
		},
	};
}

export interface FakeSnapshotDbState {
	connected: boolean;
	disconnected: boolean;
	healthChecks: number;
}

export function createFakeSnapshotDb(): FakeSnapshotDbState & {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	healthCheck(): Promise<void>;
} {
	const state: FakeSnapshotDbState = {
		connected: false,
		disconnected: false,
		healthChecks: 0,
	};
	return Object.assign(state, {
		async connect(): Promise<void> {
			state.connected = true;
		},
		async disconnect(): Promise<void> {
			state.disconnected = true;
		},
		async healthCheck(): Promise<void> {
			state.healthChecks += 1;
		},
	});
}

export interface CreateTrackingOverrides {
	state?: TrackingState;
	nextSnapshotAt?: Temporal.Instant;
	leaseUntil?: Temporal.Instant | null;
	scheduleReason?: string;
	nextMetadataAt?: Temporal.Instant | null;
	lastViews?: number;
	lastCapturedAt?: Temporal.Instant | null;
	velocity?: number;
	targetMilestone?: number | null;
	etaHours?: number | null;
	publishedAt?: Temporal.Instant | null;
	priority?: number;
	consecutiveFails?: number;
	lastError?: string | null;
}

export function createTrackingRow(
	aid: bigint,
	overrides: CreateTrackingOverrides = {}
): VideoTracking {
	const now = overrides.nextSnapshotAt ?? toInstant(new Date());
	return {
		aid,
		state: overrides.state ?? "regular",
		nextSnapshotAt: now,
		leaseUntil: overrides.leaseUntil ?? null,
		scheduleReason: overrides.scheduleReason ?? "regular",
		nextMetadataAt: overrides.nextMetadataAt ?? null,
		lastViews: overrides.lastViews ?? 0,
		lastCapturedAt: overrides.lastCapturedAt ?? null,
		velocity: overrides.velocity ?? 0,
		targetMilestone: overrides.targetMilestone ?? null,
		etaHours: overrides.etaHours ?? null,
		publishedAt: overrides.publishedAt ?? null,
		priority: overrides.priority ?? 2,
		consecutiveFails: overrides.consecutiveFails ?? 0,
		lastError: overrides.lastError ?? null,
		updatedAt: now,
	};
}

function isLeaseFree(row: VideoTracking, now: Temporal.Instant): boolean {
	return row.leaseUntil === null || row.leaseUntil.epochMilliseconds <= now.epochMilliseconds;
}

function isDue(row: VideoTracking, at: Temporal.Instant): boolean {
	return row.nextSnapshotAt.epochMilliseconds <= at.epochMilliseconds;
}

function byPriorityThenDue(a: VideoTracking, b: VideoTracking): number {
	if (a.priority !== b.priority) return a.priority - b.priority;
	return a.nextSnapshotAt.epochMilliseconds - b.nextSnapshotAt.epochMilliseconds;
}

/** In-memory {@link ITrackingRepository} with the real lease semantics. */
export class InMemoryTrackingRepository implements ITrackingRepository {
	readonly trackings = new Map<bigint, VideoTracking>();
	/** Metadata titles used to answer `listTrackingVideos({ search })`. */
	readonly metadataTitles = new Map<bigint, string>();

	async findDueVideos(limit: number, beforeTime?: Temporal.Instant): Promise<VideoTracking[]> {
		const at = beforeTime ?? toInstant(new Date());
		return [...this.trackings.values()]
			.filter((row) => isDue(row, at) && isLeaseFree(row, at))
			.sort(byPriorityThenDue)
			.slice(0, limit);
	}

	async leaseVideos(
		aids: bigint[],
		leaseUntil: Temporal.Instant,
		now?: Temporal.Instant
	): Promise<VideoTracking[]> {
		const at = now ?? toInstant(new Date());
		const wanted = new Set(aids);
		const leased: VideoTracking[] = [];
		for (const [aid, row] of this.trackings) {
			if (!wanted.has(aid) || !isDue(row, at) || !isLeaseFree(row, at)) continue;
			const next = { ...row, leaseUntil, updatedAt: at };
			this.trackings.set(aid, next);
			leased.push(next);
		}
		return leased.sort(byPriorityThenDue);
	}

	async claimDueVideos(
		now: Temporal.Instant,
		limit: number,
		leaseDurationMs: number
	): Promise<VideoTracking[]> {
		const due = await this.findDueVideos(limit, now);
		if (due.length === 0) return [];
		const leaseUntil = toInstant(new Date(now.epochMilliseconds + leaseDurationMs));
		return this.leaseVideos(
			due.map((row) => row.aid),
			leaseUntil,
			now
		);
	}

	async getTracking(aid: bigint): Promise<VideoTracking | null> {
		return this.trackings.get(aid) ?? null;
	}

	async getTrackings(aids: bigint[]): Promise<VideoTracking[]> {
		const rows: VideoTracking[] = [];
		for (const aid of aids) {
			const row = this.trackings.get(aid);
			if (row) rows.push(row);
		}
		return rows;
	}

	async upsertTracking(input: UpsertTrackingInput): Promise<VideoTracking> {
		const existing = this.trackings.get(input.aid);
		const row: VideoTracking = {
			...(existing ?? createTrackingRow(input.aid)),
			aid: input.aid,
			state: input.state ?? existing?.state ?? "regular",
			nextSnapshotAt: input.nextSnapshotAt,
			scheduleReason: input.scheduleReason ?? existing?.scheduleReason ?? "initial",
			nextMetadataAt:
				input.nextMetadataAt !== undefined
					? input.nextMetadataAt
					: (existing?.nextMetadataAt ?? null),
			leaseUntil:
				input.leaseUntil !== undefined ? input.leaseUntil : (existing?.leaseUntil ?? null),
			lastError:
				input.lastError !== undefined ? input.lastError : (existing?.lastError ?? null),
			lastViews: input.lastViews ?? existing?.lastViews ?? 0,
			lastCapturedAt: input.lastCapturedAt ?? existing?.lastCapturedAt ?? null,
			velocity: input.velocity ?? existing?.velocity ?? 0,
			targetMilestone:
				input.targetMilestone !== undefined
					? input.targetMilestone
					: (existing?.targetMilestone ?? null),
			etaHours: input.etaHours !== undefined ? input.etaHours : (existing?.etaHours ?? null),
			publishedAt: input.publishedAt ?? existing?.publishedAt ?? null,
			priority: input.priority ?? existing?.priority ?? 2,
			consecutiveFails: input.consecutiveFails ?? existing?.consecutiveFails ?? 0,
			updatedAt: toInstant(new Date()),
		};
		this.trackings.set(input.aid, row);
		return row;
	}

	async updateSchedule(
		aid: bigint,
		update: UpdateScheduleInput,
		expectedLeaseUntil?: Temporal.Instant
	): Promise<void> {
		const existing = this.trackings.get(aid);
		if (
			!existing ||
			(expectedLeaseUntil &&
				existing.leaseUntil?.epochMilliseconds !== expectedLeaseUntil.epochMilliseconds)
		)
			return;
		this.trackings.set(aid, {
			...existing,
			...(update.state ? { state: update.state } : {}),
			nextSnapshotAt: update.nextSnapshotAt ?? existing.nextSnapshotAt,
			...(update.scheduleReason !== undefined
				? { scheduleReason: update.scheduleReason }
				: {}),
			...(update.nextMetadataAt !== undefined
				? { nextMetadataAt: update.nextMetadataAt }
				: {}),
			...(update.leaseUntil !== undefined ? { leaseUntil: update.leaseUntil } : {}),
			...(update.lastError !== undefined ? { lastError: update.lastError } : {}),
			...(update.lastViews !== undefined ? { lastViews: update.lastViews } : {}),
			...(update.lastCapturedAt !== undefined
				? { lastCapturedAt: update.lastCapturedAt }
				: {}),
			...(update.velocity !== undefined ? { velocity: update.velocity } : {}),
			...(update.targetMilestone !== undefined
				? { targetMilestone: update.targetMilestone }
				: {}),
			...(update.etaHours !== undefined ? { etaHours: update.etaHours } : {}),
			...(update.priority !== undefined ? { priority: update.priority } : {}),
			...(update.consecutiveFails !== undefined
				? { consecutiveFails: update.consecutiveFails }
				: {}),
			updatedAt: toInstant(new Date()),
		});
	}

	async releaseLeases(aids: bigint[], expectedLeaseUntil?: Temporal.Instant): Promise<void> {
		for (const aid of aids) {
			const existing = this.trackings.get(aid);
			if (
				existing &&
				(!expectedLeaseUntil ||
					existing.leaseUntil?.epochMilliseconds === expectedLeaseUntil.epochMilliseconds)
			)
				this.trackings.set(aid, { ...existing, leaseUntil: null });
		}
	}

	async postponeSchedule(aids: bigint[], nextSnapshotAt: Temporal.Instant): Promise<void> {
		for (const aid of aids) {
			const existing = this.trackings.get(aid);
			if (existing) this.trackings.set(aid, { ...existing, nextSnapshotAt });
		}
	}

	async countOverdueVideos(now: Temporal.Instant | Date): Promise<OverdueTrackingSummary> {
		const at = now instanceof Date ? toInstant(now) : now;
		const overdue = [...this.trackings.values()].filter(
			(row) => isDue(row, at) && isLeaseFree(row, at)
		);
		let maxLag = 0;
		for (const row of overdue) {
			const lag = Math.floor(
				(at.epochMilliseconds - row.nextSnapshotAt.epochMilliseconds) / 1_000
			);
			if (lag > maxLag) maxLag = lag;
		}
		return { overdueCount: overdue.length, maxOverdueLagSec: maxLag };
	}

	async listTrackingVideos(params: ListTrackingVideosParams): Promise<ListTrackingVideosResult> {
		const search = params.search?.trim();
		let rows = [...this.trackings.values()];
		if (params.state) rows = rows.filter((row) => row.state === params.state);
		if (search) {
			if (/^\d+$/.test(search)) {
				rows = rows.filter((row) => row.aid === BigInt(search));
			} else {
				const matching = new Set<bigint>();
				for (const [aid, title] of this.metadataTitles) {
					if (title.includes(search)) matching.add(aid);
				}
				rows = rows.filter((row) => matching.has(row.aid));
			}
		}
		rows.sort(byPriorityThenDue);
		return {
			items: rows.slice(params.offset, params.offset + params.limit),
			total: rows.length,
		};
	}

	async deleteTracking(aid: bigint): Promise<boolean> {
		return this.trackings.delete(aid);
	}
}

export class InMemoryDiscoveryRepository implements IDiscoveryRepository {
	readonly metadatas = new Map<bigint, BilibiliVideoMetadata>();
	readonly history: BilibiliVideoMetadataHistory[] = [];
	readonly relations: BilibiliVideoRelation[] = [];
	readonly samples = new Map<bigint, DiscoverySample>();
	readonly runtimeConfigs = new Map<string, { revision: number; config: unknown }>();
	/** Aids returned by {@link listHotSampleCandidates}. */
	hotSampleAids: bigint[] = [];

	async upsertMetadata(data: UpsertMetadataInput): Promise<BilibiliVideoMetadata> {
		const now = data.capturedAt ?? toInstant(new Date());
		const existing = this.metadatas.get(data.aid);
		const currentContext = DiscoveryContextSchema.safeParse(existing?.discoveryContext);
		const incomingContext = data.discoveryContext;
		const discoveryContext = !incomingContext
			? (existing?.discoveryContext ?? null)
			: currentContext.success
				? toJson({
						origin: currentContext.data.origin,
						...((incomingContext.decision ?? currentContext.data.decision)
							? {
									decision:
										incomingContext.decision ?? currentContext.data.decision,
								}
							: {}),
						...((incomingContext.job ?? currentContext.data.job)
							? { job: incomingContext.job ?? currentContext.data.job }
							: {}),
					})
				: toJson(incomingContext);
		const meta: BilibiliVideoMetadata = {
			aid: data.aid,
			bvid: data.bvid,
			cid: data.cid ?? existing?.cid ?? null,
			videos: data.videos ?? existing?.videos ?? 1,
			tid: data.tid ?? existing?.tid ?? null,
			tidV2: data.tidV2 ?? existing?.tidV2 ?? null,
			tname: data.tname ?? existing?.tname ?? null,
			tnameV2: data.tnameV2 ?? existing?.tnameV2 ?? null,
			copyright: data.copyright ?? existing?.copyright ?? null,
			pic: data.pic ?? existing?.pic ?? null,
			title: data.title,
			pubdate: data.pubdate ?? existing?.pubdate ?? null,
			ctime: data.ctime ?? existing?.ctime ?? null,
			description: data.description ?? existing?.description ?? null,
			descV2: data.descV2 !== undefined ? toJson(data.descV2) : (existing?.descV2 ?? null),
			state: data.state ?? existing?.state ?? 0,
			duration: data.duration ?? existing?.duration ?? 0,
			Dynamic: data.Dynamic ?? existing?.Dynamic ?? null,
			dimension:
				data.dimension !== undefined
					? toJson(data.dimension)
					: (existing?.dimension ?? null),
			mid: data.mid ?? existing?.mid ?? null,
			ownerName: data.ownerName ?? existing?.ownerName ?? null,
			ownerFace: data.ownerFace ?? existing?.ownerFace ?? null,
			pages: data.pages !== undefined ? toJson(data.pages) : (existing?.pages ?? null),
			staff: data.staff !== undefined ? toJson(data.staff) : (existing?.staff ?? null),
			rights: data.rights !== undefined ? toJson(data.rights) : (existing?.rights ?? null),
			honorReply:
				data.honorReply !== undefined
					? toJson(data.honorReply)
					: (existing?.honorReply ?? null),
			tags: data.tags !== undefined ? toJson(data.tags) : (existing?.tags ?? null),
			videoStatus: data.videoStatus ?? existing?.videoStatus ?? "normal",
			filterDecision: data.filterDecision ?? existing?.filterDecision ?? "accepted",
			modelScore:
				data.modelScore !== undefined ? data.modelScore : (existing?.modelScore ?? null),
			modelVersion:
				data.modelVersion !== undefined
					? data.modelVersion
					: (existing?.modelVersion ?? null),
			discoverySource: existing?.discoverySource ?? data.discoverySource ?? null,
			discoveryContext,
			capturedAt: existing?.capturedAt ?? now,
			updatedAt: now,
		};
		this.metadatas.set(data.aid, meta);
		return meta;
	}

	async bulkUpsertMetadata(data: UpsertMetadataInput[]): Promise<void> {
		for (const item of data) {
			// Mirrors the real repository: existing rows are never overwritten.
			if (this.metadatas.has(item.aid)) continue;
			await this.upsertMetadata(item);
		}
	}

	async deleteMetadata(aid: bigint): Promise<void> {
		this.metadatas.delete(aid);
	}

	async getMetadata(aid: bigint): Promise<BilibiliVideoMetadata | null> {
		return this.metadatas.get(aid) ?? null;
	}

	async getMetadatas(aids: bigint[]): Promise<BilibiliVideoMetadata[]> {
		const result: BilibiliVideoMetadata[] = [];
		for (const aid of aids) {
			const row = this.metadatas.get(aid);
			if (row) result.push(row);
		}
		return result;
	}

	async getMetadataHistory(aid: bigint, limit = 100): Promise<BilibiliVideoMetadataHistory[]> {
		return this.history.filter((row) => row.aid === aid).slice(0, limit);
	}

	async saveRelations(relations: RelationEdge[]): Promise<void> {
		const now = toInstant(new Date());
		for (const relation of relations) {
			this.relations.push({
				sourceAid: relation.sourceAid,
				targetAid: relation.targetAid,
				position: relation.position,
				capturedAt: relation.capturedAt ?? now,
			});
		}
	}

	async getRelationsBySource(sourceAid: bigint): Promise<BilibiliVideoRelation[]> {
		return this.relations
			.filter((row) => row.sourceAid === sourceAid)
			.sort((a, b) => a.position - b.position);
	}

	async getIncomingRelations(targetAid: bigint, limit = 50): Promise<BilibiliVideoRelation[]> {
		return this.relations.filter((row) => row.targetAid === targetAid).slice(0, limit);
	}

	async listHotSampleCandidates(_options: HotSampleOptions): Promise<bigint[]> {
		return this.hotSampleAids;
	}

	async upsertSample(sample: UpsertDiscoverySampleInput): Promise<DiscoverySample> {
		const existing = this.samples.get(sample.aid);
		const row: DiscoverySample = {
			aid: sample.aid,
			bvid: sample.bvid,
			title: sample.title,
			description: sample.description ?? existing?.description ?? null,
			tags: sample.tags !== undefined ? toJson(sample.tags) : (existing?.tags ?? null),
			decision: sample.decision,
			modelVersion: sample.modelVersion,
			probabilities: toJson(sample.probabilities),
			songProbability: sample.songProbability,
			humanLabel: sample.humanLabel ?? existing?.humanLabel ?? null,
			labeledAt: sample.labeledAt ?? existing?.labeledAt ?? null,
			createdAt: existing?.createdAt ?? sample.createdAt ?? toInstant(new Date()),
		};
		this.samples.set(sample.aid, row);
		return row;
	}

	private filteredSamples(options: ListDiscoverySamplesOptions = {}): DiscoverySample[] {
		let rows = [...this.samples.values()];
		if (options.decision) rows = rows.filter((r) => r.decision === options.decision);
		if (options.labeled !== undefined)
			rows = rows.filter((r) => (r.humanLabel !== null) === options.labeled);
		if (options.minConfidence !== undefined)
			rows = rows.filter((r) => r.songProbability >= (options.minConfidence ?? 0));
		if (options.maxConfidence !== undefined)
			rows = rows.filter((r) => r.songProbability <= (options.maxConfidence ?? 1));
		if (options.source)
			rows = rows.filter(
				(r) => this.metadatas.get(r.aid)?.discoverySource === options.source
			);
		const search = options.search?.trim();
		if (search)
			rows = rows.filter(
				(r) =>
					r.aid.toString() === search.replace(/^av/i, "") ||
					r.bvid === search ||
					r.title.includes(search)
			);
		return rows;
	}

	async countSamples(options: ListDiscoverySamplesOptions = {}): Promise<number> {
		return this.filteredSamples(options).length;
	}

	async listSamples(options: ListDiscoverySamplesOptions = {}): Promise<DiscoverySample[]> {
		const rows = this.filteredSamples(options);
		const direction = options.sortOrder === "asc" ? 1 : -1;
		rows.sort((a, b) => {
			const compared =
				options.sortBy === "confidence"
					? a.songProbability - b.songProbability
					: options.sortBy === "aid"
						? a.aid < b.aid
							? -1
							: a.aid > b.aid
								? 1
								: 0
						: a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds;
			return compared * direction || (a.aid > b.aid ? -1 : a.aid < b.aid ? 1 : 0);
		});
		const offset = options.offset ?? 0;
		return rows.slice(offset, offset + (options.limit ?? 50));
	}

	async getSample(aid: bigint): Promise<DiscoverySample | null> {
		return this.samples.get(aid) ?? null;
	}

	async labelSample(aid: bigint, humanLabel: number): Promise<DiscoverySample | null> {
		const existing = this.samples.get(aid);
		if (!existing) return null;
		const row: DiscoverySample = { ...existing, humanLabel, labeledAt: toInstant(new Date()) };
		this.samples.set(aid, row);
		return row;
	}

	async getRuntimeConfig(key: string): Promise<{ revision: number; config: unknown } | null> {
		return this.runtimeConfigs.get(key) ?? null;
	}

	async saveRuntimeConfig(
		key: string,
		config: unknown,
		expectedRevision?: number
	): Promise<{ revision: number; config: unknown }> {
		const existing = this.runtimeConfigs.get(key);
		if (existing && expectedRevision !== undefined && existing.revision !== expectedRevision) {
			throw new Error(`revision conflict for ${key}`);
		}
		const next = { revision: (existing?.revision ?? 0) + 1, config };
		this.runtimeConfigs.set(key, next);
		return next;
	}

	readonly exploredWindows = new Set<string>();

	async markSearchWindowsExplored(
		windows: { keyword: string; windowStart: number }[]
	): Promise<void> {
		for (const w of windows) {
			this.exploredWindows.add(`${w.keyword}:${w.windowStart}`);
		}
	}

	async getExploredSearchWindows(
		keyword: string,
		fromWindow: number,
		toWindow: number
	): Promise<Set<number>> {
		const result = new Set<number>();
		for (let w = fromWindow; w <= toWindow; w += 600) {
			if (this.exploredWindows.has(`${keyword}:${w}`)) {
				result.add(w);
			}
		}
		return result;
	}
}

/** Minimal {@link DiscoveryFilterConfigStore} backed by a map. */
export class InMemoryFilterConfigStore implements DiscoveryFilterConfigStore {
	readonly entries = new Map<string, { revision: number; config: unknown }>();

	async getRuntimeConfig(key: string): Promise<{ revision: number; config: unknown } | null> {
		return this.entries.get(key) ?? null;
	}

	async saveRuntimeConfig(
		key: string,
		config: unknown,
		expectedRevision?: number
	): Promise<{ revision: number; config: unknown }> {
		const existing = this.entries.get(key);
		if (existing && expectedRevision !== undefined && existing.revision !== expectedRevision) {
			throw new Error(`revision conflict for ${key}`);
		}
		const next = { revision: (existing?.revision ?? 0) + 1, config };
		this.entries.set(key, next);
		return next;
	}
}
