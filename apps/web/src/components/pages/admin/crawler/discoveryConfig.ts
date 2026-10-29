import type { DiscoveryFilterConfigDto, UpdateDiscoveryFilterConfigRequest } from "@cvsa/contracts";

/**
 * Build the discovery settings save payload.
 *
 * Every editable field is copied explicitly, including the classifier switch and
 * threshold: an omission there silently resets the classifier to its defaults on
 * every save.
 */
export function toDiscoveryConfigUpdatePayload(
	config: DiscoveryFilterConfigDto
): UpdateDiscoveryFilterConfigRequest {
	return {
		searchKeywords: config.searchKeywords,
		whitelistSingers: config.whitelistSingers,
		whitelistSongIndicators: config.whitelistSongIndicators,
		blacklistKeywords: config.blacklistKeywords,
		minDurationSeconds: config.minDurationSeconds,
		maxDurationSeconds: config.maxDurationSeconds,
		rejectionSampleRate: config.rejectionSampleRate,
		modelEnabled: config.modelEnabled,
		modelThreshold: config.modelThreshold,
	};
}
