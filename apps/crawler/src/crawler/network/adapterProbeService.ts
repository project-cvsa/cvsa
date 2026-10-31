import { BilibiliEnvelopeSchema, AppError, type TestNetworkAdapterResponse } from "@cvsa/contracts";
import type { BilibiliClient } from "../bilibili";
import type { NetworkRuntimeConfigService } from "./service";

export class AdapterProbeService {
	constructor(
		private readonly config: NetworkRuntimeConfigService,
		private readonly client: BilibiliClient
	) {}
	async test(adapterId: string): Promise<TestNetworkAdapterResponse> {
		const document = await this.config.get();
		if (!document?.config.adapters.some((adapter) => adapter.id === adapterId))
			throw new AppError("Adapter not found", "NOT_FOUND", 404);
		const startedAt = performance.now();
		try {
			const response = await this.client.diagnostic(adapterId);
			let body: unknown;
			try {
				body = JSON.parse(response.body);
			} catch {
				body = undefined;
			}
			const envelope = BilibiliEnvelopeSchema.safeParse(body);
			const ok =
				response.status >= 200 &&
				response.status < 400 &&
				envelope.success &&
				envelope.data.code === 0;
			const error =
				envelope.success && envelope.data.code !== 0
					? `Bilibili ${envelope.data.code}: ${envelope.data.message}`
					: `HTTP ${response.status}`;
			return {
				adapterId,
				ok,
				status: response.status,
				latencyMs: performance.now() - startedAt,
				...(!ok ? { error } : {}),
			};
		} catch (error) {
			return {
				adapterId,
				ok: false,
				latencyMs: performance.now() - startedAt,
				error: error instanceof Error ? error.message : "Adapter request failed",
			};
		}
	}
}
