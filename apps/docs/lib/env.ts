/**
 * Site URL configuration.
 * Set NEXT_PUBLIC_SITE_URL in CI/CD or .env.local to override.
 * Falls back to production URL during build.
 */
const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://docs.projectcvsa.com";
export const siteUrl = raw.replace(/\/$/, "");
