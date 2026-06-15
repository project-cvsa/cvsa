import { siteUrl } from "./env";

/** Shared title used across OG tags */
export const SITE_TITLE = "Project CVSA | Archive for a Better Future";
export const SITE_TITLE_404 = "Not Found";

/** Shared description used across OG tags */
export const SITE_DESCRIPTION = "Project CVSA is an archive program aiming to collect and preserve all information about the Chinese singing voice synthesis community.";
export const SITE_DESCRIPTION_404 = "The page you are looking for does not exist.";

export const SITE_URL = siteUrl;

/** OG image dimensions (android-chrome-512x512.png) */
export const OG_IMAGE_SIZE = 512;

/**
 * Returns the full OG image URL.
 * Uses the static android-chrome-512x512.png icon.	
 * No hardcoded URLs — uses siteUrl from env.
 */
export function ogImageUrl(): string {
	return `${siteUrl}/android-chrome-512x512.png`;
}
