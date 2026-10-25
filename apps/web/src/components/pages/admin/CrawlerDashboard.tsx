import { createSignal, onMount, For, Show } from "solid-js";
import Button from "@components/ui/Button";
import { ToastContainer, toast } from "@components/ui/Toast";
import { api } from "@lib/api";
import type {
	BilibiliVideoMetadataDto,
	BilibiliVideoRelationDto,
	CrawlerStatusDto,
	DiscoveryFilterConfigDto,
	VideoTrackingDto,
} from "@cvsa/contracts";

export default function CrawlerDashboard() {
	const [activeTab, setActiveTab] = createSignal<"status" | "config" | "actions" | "inspector">(
		"status"
	);

	// Status
	const [statusData, setStatusData] = createSignal<CrawlerStatusDto | null>(null);
	const [loadingStatus, setLoadingStatus] = createSignal(false);

	// Config
	const [configData, setConfigData] = createSignal<DiscoveryFilterConfigDto | null>(null);
	const [loadingConfig, setLoadingConfig] = createSignal(false);
	const [savingConfig, setSavingConfig] = createSignal(false);
	const [newSinger, setNewSinger] = createSignal("");
	const [newIndicator, setNewIndicator] = createSignal("");
	const [newBlacklist, setNewBlacklist] = createSignal("");

	// Actions
	const [sweepKeyword, setSweepKeyword] = createSignal("");
	const [sweepRunning, setSweepRunning] = createSignal(false);
	const [sweepResult, setSweepResult] = createSignal<string | null>(null);
	const [actionAid, setActionAid] = createSignal("");
	const [actionRunning, setActionRunning] = createSignal(false);

	// Inspector
	const [inspectAid, setInspectAid] = createSignal("");
	const [inspectLoading, setInspectLoading] = createSignal(false);
	const [trackingInfo, setTrackingInfo] = createSignal<VideoTrackingDto | null>(null);
	const [metadataInfo, setMetadataInfo] = createSignal<BilibiliVideoMetadataDto | null>(null);
	const [relationsInfo, setRelationsInfo] = createSignal<BilibiliVideoRelationDto[] | null>(null);

	const fetchStatus = async () => {
		setLoadingStatus(true);
		const res = await api.crawler.getStatus();
		setLoadingStatus(false);
		if (res.ok && res.data) {
			setStatusData(res.data);
		} else {
			toast.error(res.ok ? "No status data" : res.error.message || "Failed to fetch status");
		}
	};

	const fetchConfig = async () => {
		setLoadingConfig(true);
		const res = await api.crawler.getDiscoveryConfig();
		setLoadingConfig(false);
		if (res.ok && res.data) {
			setConfigData(res.data);
		} else {
			toast.error(res.ok ? "No config data" : res.error.message || "Failed to fetch config");
		}
	};

	const saveConfig = async () => {
		const current = configData();
		if (!current) return;
		setSavingConfig(true);
		const res = await api.crawler.updateDiscoveryConfig({
			whitelistSingers: current.whitelistSingers,
			whitelistSongIndicators: current.whitelistSongIndicators,
			blacklistKeywords: current.blacklistKeywords,
			minDurationSeconds: current.minDurationSeconds,
			maxDurationSeconds: current.maxDurationSeconds,
			rejectionSampleRate: current.rejectionSampleRate,
		});
		setSavingConfig(false);
		if (res.ok && res.data) {
			setConfigData(res.data);
			toast.success("Discovery configuration updated");
		} else {
			toast.error(res.ok ? "Save failed" : res.error.message || "Failed to update config");
		}
	};

	const handleAddSinger = () => {
		const name = newSinger().trim();
		if (!name) return;
		const curr = configData();
		if (curr && !curr.whitelistSingers.includes(name)) {
			setConfigData({ ...curr, whitelistSingers: [...curr.whitelistSingers, name] });
			setNewSinger("");
		}
	};

	const handleRemoveSinger = (singer: string) => {
		const curr = configData();
		if (curr) {
			setConfigData({
				...curr,
				whitelistSingers: curr.whitelistSingers.filter((s) => s !== singer),
			});
		}
	};

	const handleAddIndicator = () => {
		const ind = newIndicator().trim();
		if (!ind) return;
		const curr = configData();
		if (curr && !curr.whitelistSongIndicators.includes(ind)) {
			setConfigData({
				...curr,
				whitelistSongIndicators: [...curr.whitelistSongIndicators, ind],
			});
			setNewIndicator("");
		}
	};

	const handleRemoveIndicator = (ind: string) => {
		const curr = configData();
		if (curr) {
			setConfigData({
				...curr,
				whitelistSongIndicators: curr.whitelistSongIndicators.filter((k) => k !== ind),
			});
		}
	};

	const handleAddBlacklist = () => {
		const bl = newBlacklist().trim();
		if (!bl) return;
		const curr = configData();
		if (curr && !curr.blacklistKeywords.includes(bl)) {
			setConfigData({ ...curr, blacklistKeywords: [...curr.blacklistKeywords, bl] });
			setNewBlacklist("");
		}
	};

	const handleRemoveBlacklist = (bl: string) => {
		const curr = configData();
		if (curr) {
			setConfigData({
				...curr,
				blacklistKeywords: curr.blacklistKeywords.filter((k) => k !== bl),
			});
		}
	};

	const handleTriggerSweep = async () => {
		setSweepRunning(true);
		setSweepResult(null);
		const kw = sweepKeyword().trim();
		const res = await api.crawler.triggerSweep({
			keywords: kw ? [kw] : undefined,
			pagesPerQuery: 2,
		});
		setSweepRunning(false);
		if (res.ok && res.data) {
			setSweepResult(
				`Sweep finished: Total Discovered ${res.data.totalDiscovered}, Newly Tracked ${res.data.newTracked}`
			);
			toast.success("Sweep triggered successfully");
		} else {
			toast.error(res.ok ? "Sweep failed" : res.error.message || "Failed to trigger sweep");
		}
	};

	const handleFetchDetail = async () => {
		const aid = actionAid().trim();
		if (!aid) return;
		setActionRunning(true);
		const res = await api.crawler.fetchDetail(aid);
		setActionRunning(false);
		if (res.ok) {
			toast.success(`Detail job queued for AID: ${aid}`);
		} else {
			toast.error(res.error.message || "Failed to queue detail job");
		}
	};

	const handleTriggerActive = async () => {
		const aid = actionAid().trim();
		if (!aid) return;
		setActionRunning(true);
		const res = await api.crawler.triggerActive(aid);
		setActionRunning(false);
		if (res.ok) {
			toast.success(`Active discovery queued for AID: ${aid}`);
		} else {
			toast.error(res.error.message || "Failed to queue active discovery");
		}
	};

	const handleInspect = async () => {
		const aid = inspectAid().trim();
		if (!aid) return;
		setInspectLoading(true);
		const [trackRes, metaRes, relRes] = await Promise.all([
			api.crawler.getTracking(aid),
			api.crawler.getMetadata(aid),
			api.crawler.getRelations(aid),
		]);
		setInspectLoading(false);

		if (trackRes.ok) {
			setTrackingInfo(trackRes.data);
		} else {
			setTrackingInfo(null);
		}

		if (metaRes.ok) {
			setMetadataInfo(metaRes.data);
		} else {
			setMetadataInfo(null);
		}

		if (relRes.ok) {
			setRelationsInfo(relRes.data);
		} else {
			setRelationsInfo(null);
		}

		if (!trackRes.ok && !metaRes.ok) {
			toast.error(`No record found for AID: ${aid}`);
		}
	};

	const handlePromoteMilestone = async (targetMilestone: number) => {
		const aid = inspectAid().trim();
		if (!aid) return;
		const res = await api.crawler.promoteTracking(aid, { targetMilestone, priority: 1 });
		if (res.ok && res.data) {
			setTrackingInfo(res.data);
			toast.success(`Target milestone updated to ${targetMilestone}`);
		} else {
			toast.error(res.ok ? "Failed" : res.error.message || "Failed to promote milestone");
		}
	};

	const formatTags = (tags: unknown): string[] => {
		if (Array.isArray(tags)) {
			return tags.map((t) => (typeof t === "string" ? t : JSON.stringify(t)));
		}
		if (typeof tags === "string") {
			try {
				const parsed = JSON.parse(tags);
				if (Array.isArray(parsed)) return parsed.map(String);
			} catch {
				return [tags];
			}
		}
		return [];
	};

	onMount(() => {
		fetchStatus();
		fetchConfig();
	});

	return (
		<div class="flex flex-col gap-6">
			<ToastContainer />
			<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-4">
				<div>
					<h1 class="ts-heading-1 text-primary">Crawler Control Panel</h1>
					<p class="ts-body text-tertiary">
						Monitor network runtime, tune discovery filters, dispatch jobs, and inspect
						metadata.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant={activeTab() === "status" ? "filled" : "outlined"}
						size="sm"
						onClick={() => setActiveTab("status")}
					>
						Status
					</Button>
					<Button
						variant={activeTab() === "config" ? "filled" : "outlined"}
						size="sm"
						onClick={() => setActiveTab("config")}
					>
						Discovery Config
					</Button>
					<Button
						variant={activeTab() === "actions" ? "filled" : "outlined"}
						size="sm"
						onClick={() => setActiveTab("actions")}
					>
						Operations
					</Button>
					<Button
						variant={activeTab() === "inspector" ? "filled" : "outlined"}
						size="sm"
						onClick={() => setActiveTab("inspector")}
					>
						Inspector
					</Button>
				</div>
			</div>

			{/* Tab 1: Status */}
			<Show when={activeTab() === "status"}>
				<div class="flex flex-col gap-4">
					<div class="flex items-center justify-between">
						<h2 class="ts-heading-2 text-primary">Network Runtime & Adapters Status</h2>
						<Button
							size="sm"
							variant="outlined"
							disabled={loadingStatus()}
							onClick={fetchStatus}
						>
							{loadingStatus() ? "Refreshing..." : "Refresh"}
						</Button>
					</div>

					<Show
						when={statusData()}
						fallback={
							<div class="p-8 text-center text-tertiary border border-border rounded">
								{loadingStatus()
									? "Loading runtime status..."
									: "No status available."}
							</div>
						}
					>
						{(status) => (
							<div class="flex flex-col gap-4">
								<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div class="p-4 rounded border border-border flex flex-col gap-2">
										<span class="ts-caption text-tertiary">Runtime Ready</span>
										<span class="ts-heading-3 font-semibold text-primary">
											{status().ready ? "READY (Online)" : "NOT READY"}
										</span>
										<span class="ts-caption text-tertiary">
											Revision: {status().revision ?? 0}
										</span>
									</div>

									<div class="p-4 rounded border border-border flex flex-col gap-2">
										<span class="ts-caption text-tertiary">
											Configured Adapters
										</span>
										<span class="ts-heading-3 font-semibold text-primary">
											{status().adapters.length}
										</span>
										<span class="ts-caption text-tertiary">
											Active:{" "}
											{status().adapters.filter((a) => a.enabled).length}
										</span>
									</div>

									<div class="p-4 rounded border border-border flex flex-col gap-2">
										<span class="ts-caption text-tertiary">
											Healthy Adapters
										</span>
										<span class="ts-heading-3 font-semibold text-primary">
											{
												status().adapters.filter(
													(a) => a.healthState === "HEALTHY"
												).length
											}
										</span>
										<span class="ts-caption text-error">
											Degraded/Failing:{" "}
											{
												status().adapters.filter(
													(a) => a.healthState !== "HEALTHY"
												).length
											}
										</span>
									</div>
								</div>

								<div class="p-4 rounded border border-border flex flex-col gap-3">
									<h3 class="ts-subhead font-semibold text-primary">
										Adapter Details
									</h3>
									<div class="overflow-x-auto">
										<table class="w-full text-left ts-caption">
											<thead>
												<tr class="border-b border-border text-tertiary">
													<th class="py-2 px-3">Adapter ID</th>
													<th class="py-2 px-3">State</th>
													<th class="py-2 px-3">Health Factor</th>
													<th class="py-2 px-3">Effective Weight</th>
													<th class="py-2 px-3">Failures</th>
												</tr>
											</thead>
											<tbody>
												<For each={status().adapters}>
													{(adapter) => (
														<tr class="border-b border-border hover:bg-hover">
															<td class="py-2 px-3 font-mono font-medium text-primary">
																{adapter.id}
															</td>
															<td class="py-2 px-3 font-mono">
																{adapter.healthState}
															</td>
															<td class="py-2 px-3">
																{Math.round(
																	adapter.healthFactor * 100
																)}
																%
															</td>
															<td class="py-2 px-3">
																{adapter.effectiveWeight}
															</td>
															<td class="py-2 px-3">
																{adapter.consecutiveFailures}
															</td>
														</tr>
													)}
												</For>
											</tbody>
										</table>
									</div>
								</div>
							</div>
						)}
					</Show>
				</div>
			</Show>

			{/* Tab 2: Config */}
			<Show when={activeTab() === "config"}>
				<div class="flex flex-col gap-6">
					<div class="flex items-center justify-between">
						<div>
							<h2 class="ts-heading-2 text-primary">
								Discovery Filter Configuration
							</h2>
							<p class="ts-caption text-tertiary">
								Manage candidate selection whitelist, blacklists, duration windows,
								and sampling rates.
							</p>
						</div>
						<div class="flex items-center gap-2">
							<Button
								size="sm"
								variant="outlined"
								disabled={loadingConfig()}
								onClick={fetchConfig}
							>
								Reload
							</Button>
							<Button
								size="sm"
								variant="filled"
								disabled={savingConfig() || !configData()}
								onClick={saveConfig}
							>
								{savingConfig() ? "Saving..." : "Save Changes"}
							</Button>
						</div>
					</div>

					<Show when={configData()}>
						{(cfg) => (
							<div class="flex flex-col gap-6">
								{/* Singers */}
								<div class="p-4 rounded border border-border flex flex-col gap-3">
									<div class="flex items-center justify-between">
										<span class="ts-label font-semibold text-primary">
											Whitelist Singers ({cfg().whitelistSingers.length})
										</span>
									</div>
									<div class="flex flex-wrap gap-2">
										<For each={cfg().whitelistSingers}>
											{(singer) => (
												<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-hover border border-border ts-caption text-primary">
													{singer}
													<button
														type="button"
														class="text-tertiary hover:text-error ml-1"
														onClick={() => handleRemoveSinger(singer)}
													>
														×
													</button>
												</span>
											)}
										</For>
									</div>
									<div class="flex items-center gap-2 mt-2">
										<input
											type="text"
											class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm w-64"
											placeholder="Add singer name..."
											value={newSinger()}
											onInput={(e) => setNewSinger(e.currentTarget.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && handleAddSinger()
											}
										/>
										<Button
											size="sm"
											variant="outlined"
											onClick={handleAddSinger}
										>
											Add
										</Button>
									</div>
								</div>

								{/* Keywords / Indicators */}
								<div class="p-4 rounded border border-border flex flex-col gap-3">
									<span class="ts-label font-semibold text-primary">
										Whitelist Song Indicators (
										{cfg().whitelistSongIndicators.length})
									</span>
									<div class="flex flex-wrap gap-2">
										<For each={cfg().whitelistSongIndicators}>
											{(ind) => (
												<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-hover border border-border ts-caption text-primary">
													{ind}
													<button
														type="button"
														class="text-tertiary hover:text-error ml-1"
														onClick={() => handleRemoveIndicator(ind)}
													>
														×
													</button>
												</span>
											)}
										</For>
									</div>
									<div class="flex items-center gap-2 mt-2">
										<input
											type="text"
											class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm w-64"
											placeholder="Add indicator keyword..."
											value={newIndicator()}
											onInput={(e) => setNewIndicator(e.currentTarget.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && handleAddIndicator()
											}
										/>
										<Button
											size="sm"
											variant="outlined"
											onClick={handleAddIndicator}
										>
											Add
										</Button>
									</div>
								</div>

								{/* Blacklist */}
								<div class="p-4 rounded border border-border flex flex-col gap-3">
									<span class="ts-label font-semibold text-primary">
										Blacklist Keywords ({cfg().blacklistKeywords.length})
									</span>
									<div class="flex flex-wrap gap-2">
										<For each={cfg().blacklistKeywords}>
											{(bl) => (
												<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-hover border border-border ts-caption text-primary">
													{bl}
													<button
														type="button"
														class="text-tertiary hover:text-error ml-1"
														onClick={() => handleRemoveBlacklist(bl)}
													>
														×
													</button>
												</span>
											)}
										</For>
									</div>
									<div class="flex items-center gap-2 mt-2">
										<input
											type="text"
											class="h-9 px-3 border border-border rounded text-primary bg-transparent text-sm w-64"
											placeholder="Add negative keyword..."
											value={newBlacklist()}
											onInput={(e) => setNewBlacklist(e.currentTarget.value)}
											onKeyDown={(e) =>
												e.key === "Enter" && handleAddBlacklist()
											}
										/>
										<Button
											size="sm"
											variant="outlined"
											onClick={handleAddBlacklist}
										>
											Add
										</Button>
									</div>
								</div>

								{/* Numeric Boundaries */}
								<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div class="p-4 rounded border border-border flex flex-col gap-2">
										<label class="ts-label text-primary font-medium">
											Min Duration (seconds)
										</label>
										<input
											type="number"
											class="h-10 px-3 border border-border rounded text-primary bg-transparent"
											value={cfg().minDurationSeconds}
											onInput={(e) =>
												setConfigData({
													...cfg(),
													minDurationSeconds:
														Number.parseInt(
															e.currentTarget.value,
															10
														) || 0,
												})
											}
										/>
									</div>
									<div class="p-4 rounded border border-border flex flex-col gap-2">
										<label class="ts-label text-primary font-medium">
											Max Duration (seconds)
										</label>
										<input
											type="number"
											class="h-10 px-3 border border-border rounded text-primary bg-transparent"
											value={cfg().maxDurationSeconds}
											onInput={(e) =>
												setConfigData({
													...cfg(),
													maxDurationSeconds:
														Number.parseInt(
															e.currentTarget.value,
															10
														) || 0,
												})
											}
										/>
									</div>
									<div class="p-4 rounded border border-border flex flex-col gap-2">
										<label class="ts-label text-primary font-medium">
											Rejection Sample Rate (
											{Math.round(cfg().rejectionSampleRate * 100)}%)
										</label>
										<input
											type="range"
											min="0"
											max="1"
											step="0.01"
											class="h-10"
											value={cfg().rejectionSampleRate}
											onInput={(e) =>
												setConfigData({
													...cfg(),
													rejectionSampleRate:
														Number.parseFloat(e.currentTarget.value) ||
														0,
												})
											}
										/>
									</div>
								</div>
							</div>
						)}
					</Show>
				</div>
			</Show>

			{/* Tab 3: Actions & Operations */}
			<Show when={activeTab() === "actions"}>
				<div class="flex flex-col gap-6">
					<h2 class="ts-heading-2 text-primary">Crawler Operations & Manual Triggers</h2>

					{/* Sweep Card */}
					<div class="p-4 rounded border border-border flex flex-col gap-4">
						<div>
							<h3 class="ts-subhead font-semibold text-primary">
								Trigger Search Sweep
							</h3>
							<p class="ts-caption text-tertiary">
								Run on-demand search sweep with Bilibili WBI query across keywords.
							</p>
						</div>
						<div class="flex items-center gap-3">
							<input
								type="text"
								class="h-10 px-3 border border-border rounded text-primary bg-transparent w-80 text-sm"
								placeholder="Keyword (leave blank for all default keywords)..."
								value={sweepKeyword()}
								onInput={(e) => setSweepKeyword(e.currentTarget.value)}
							/>
							<Button
								size="md"
								variant="filled"
								disabled={sweepRunning()}
								onClick={handleTriggerSweep}
							>
								{sweepRunning() ? "Running Sweep..." : "Execute Sweep"}
							</Button>
						</div>
						<Show when={sweepResult()}>
							{(res) => (
								<div class="p-3 rounded bg-hover text-sm text-primary border border-border">
									{res()}
								</div>
							)}
						</Show>
					</div>

					{/* Detail & Active Discovery Card */}
					<div class="p-4 rounded border border-border flex flex-col gap-4">
						<div>
							<h3 class="ts-subhead font-semibold text-primary">
								Single AID Operations
							</h3>
							<p class="ts-caption text-tertiary">
								Fetch video detail & related recommendations or trigger recursive
								active discovery.
							</p>
						</div>
						<div class="flex items-center gap-3">
							<input
								type="text"
								class="h-10 px-3 border border-border rounded text-primary bg-transparent w-80 text-sm"
								placeholder="Enter Bilibili AID (e.g. 170001)..."
								value={actionAid()}
								onInput={(e) => setActionAid(e.currentTarget.value)}
							/>
							<Button
								size="md"
								variant="outlined"
								disabled={actionRunning() || !actionAid()}
								onClick={handleFetchDetail}
							>
								Fetch Details & Related
							</Button>
							<Button
								size="md"
								variant="filled"
								disabled={actionRunning() || !actionAid()}
								onClick={handleTriggerActive}
							>
								Active Discovery
							</Button>
						</div>
					</div>
				</div>
			</Show>

			{/* Tab 4: Inspector */}
			<Show when={activeTab() === "inspector"}>
				<div class="flex flex-col gap-6">
					<div>
						<h2 class="ts-heading-2 text-primary">Video & Topology Inspector</h2>
						<p class="ts-caption text-tertiary">
							Inspect tracking status, cached metadata, and recommendation relations
							graph.
						</p>
					</div>

					<div class="flex items-center gap-3">
						<input
							type="text"
							class="h-10 px-3 border border-border rounded text-primary bg-transparent w-80 text-sm"
							placeholder="Enter AID to inspect..."
							value={inspectAid()}
							onInput={(e) => setInspectAid(e.currentTarget.value)}
							onKeyDown={(e) => e.key === "Enter" && handleInspect()}
						/>
						<Button
							size="md"
							variant="filled"
							disabled={inspectLoading() || !inspectAid()}
							onClick={handleInspect}
						>
							{inspectLoading() ? "Querying..." : "Inspect"}
						</Button>
					</div>

					{/* Tracking Info Card */}
					<Show when={trackingInfo()}>
						{(track) => (
							<div class="p-4 rounded border border-border flex flex-col gap-3">
								<div class="flex items-center justify-between">
									<h3 class="ts-subhead font-semibold text-primary">
										Tracking Status: AID {track().aid}
									</h3>
									<span class="px-2.5 py-0.5 rounded text-xs font-medium uppercase bg-hover border border-border text-primary">
										{track().state}
									</span>
								</div>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4 ts-caption text-tertiary">
									<div>
										Velocity:{" "}
										<span class="text-primary font-medium">
											{track().velocity}/hr
										</span>
									</div>
									<div>
										Fails:{" "}
										<span class="text-primary font-medium">
											{track().consecutiveFails}
										</span>
									</div>
									<div>
										Last Captured:{" "}
										<span class="text-primary font-medium">
											{track().lastCapturedAt
												? new Date(track().lastCapturedAt!).toLocaleString()
												: "Never"}
										</span>
									</div>
									<div>
										Next Snapshot:{" "}
										<span class="text-primary font-medium">
											{new Date(track().nextSnapshotAt).toLocaleString()}
										</span>
									</div>
								</div>
								<div class="flex items-center gap-2 mt-2 pt-2 border-t border-border">
									<span class="ts-caption text-tertiary">
										Set Target Milestone:
									</span>
									<Button
										size="sm"
										variant="outlined"
										onClick={() => handlePromoteMilestone(100_000)}
									>
										100K (殿堂)
									</Button>
									<Button
										size="sm"
										variant="outlined"
										onClick={() => handlePromoteMilestone(1_000_000)}
									>
										1M (传说)
									</Button>
									<Button
										size="sm"
										variant="outlined"
										onClick={() => handlePromoteMilestone(10_000_000)}
									>
										10M (神话)
									</Button>
								</div>
							</div>
						)}
					</Show>

					{/* Metadata Card */}
					<Show when={metadataInfo()}>
						{(meta) => (
							<div class="p-4 rounded border border-border flex flex-col gap-3">
								<h3 class="ts-subhead font-semibold text-primary">
									Bilibili Video Metadata
								</h3>
								<div class="ts-body font-medium text-primary">{meta().title}</div>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4 ts-caption text-tertiary">
									<div>
										UP Name:{" "}
										<span class="text-primary font-medium">
											{meta().ownerName ?? "N/A"}
										</span>
									</div>
									<div>
										Duration:{" "}
										<span class="text-primary font-medium">
											{meta().duration}s
										</span>
									</div>
									<div>
										Category:{" "}
										<span class="text-primary font-medium">
											{meta().tname ?? "N/A"}
										</span>
									</div>
									<div>
										Published:{" "}
										<span class="text-primary font-medium">
											{meta().pubdate
												? new Date(meta().pubdate!).toLocaleDateString()
												: "N/A"}
										</span>
									</div>
								</div>
								<Show when={formatTags(meta().tags).length > 0}>
									<div class="flex flex-wrap gap-1.5 pt-2 border-t border-border">
										<For each={formatTags(meta().tags)}>
											{(tag) => (
												<span class="px-2 py-0.5 rounded bg-hover ts-caption text-secondary border border-border">
													#{tag}
												</span>
											)}
										</For>
									</div>
								</Show>
							</div>
						)}
					</Show>

					{/* Relations Graph List */}
					<Show when={relationsInfo() && relationsInfo()!.length > 0}>
						<div class="p-4 rounded border border-border flex flex-col gap-3">
							<h3 class="ts-subhead font-semibold text-primary">
								Recommendation Graph ({relationsInfo()!.length} edges)
							</h3>
							<div class="overflow-x-auto">
								<table class="w-full text-left ts-caption">
									<thead>
										<tr class="border-b border-border text-tertiary">
											<th class="py-2 px-3">Position</th>
											<th class="py-2 px-3">Source AID</th>
											<th class="py-2 px-3">Target AID</th>
											<th class="py-2 px-3">Captured At</th>
										</tr>
									</thead>
									<tbody>
										<For each={relationsInfo()}>
											{(rel) => (
												<tr class="border-b border-border hover:bg-hover">
													<td class="py-2 px-3 font-mono">
														{rel.position}
													</td>
													<td class="py-2 px-3 font-mono">
														{rel.sourceAid}
													</td>
													<td class="py-2 px-3 font-mono font-medium text-primary">
														{rel.targetAid}
													</td>
													<td class="py-2 px-3 text-tertiary">
														{new Date(rel.capturedAt).toLocaleString()}
													</td>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
						</div>
					</Show>
				</div>
			</Show>
		</div>
	);
}
