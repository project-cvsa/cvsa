/**
 * Site URL configuration.
 * Set NEXT_PUBLIC_SITE_URL in CI/CD or .env.local to override.
 * Falls back to production URL during build.
 */
export const siteUrl =
	process.env.NEXT_PUBLIC_SITE_URL || "https://docs.projectcvsa.com";