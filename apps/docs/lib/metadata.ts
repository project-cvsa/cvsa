import { siteUrl } from "./env";

/** Shared title used across OG tags */
export const SITE_TITLE = "Project CVSA | Archive for a Better Future";

/** Shared description used across OG tags */
export const SITE_DESCRIPTION =
	"Project CVSA is an archive program aiming to collect and preserve all information about the Chinese singing voice synthesis community.";

/** OG image dimensions (android-chrome-192x192.png) */
export const OG_IMAGE_SIZE = 192;

/**
 * Returns the full OG image URL.
 * Uses the static android-chrome-192x192.png icon.
 * No hardcoded URLs — uses siteUrl from env.
 */
export function ogImageUrl(): string {
	return `${siteUrl}/android-chrome-192x192.png`;
}