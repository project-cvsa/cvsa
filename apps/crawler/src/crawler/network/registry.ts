import { AdapterRegistry, createAxiosNetworkTransport } from "@cvsa/network-scheduler";
import { createBilibiliApplicationErrorClassifier } from "./bilibiliClassifier";

/**
 * Builds the adapter registry used by the crawler runtime. Bilibili response
 * semantics are injected here rather than baked into `@cvsa/network-scheduler`;
 * the transport keeps a sane default when no classifier is provided.
 */
export function createCrawlerAdapterRegistry(): AdapterRegistry {
	return new AdapterRegistry(
		createAxiosNetworkTransport(undefined, {
			classifyApplicationError: createBilibiliApplicationErrorClassifier(),
		})
	);
}
