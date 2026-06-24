import "./global.css";
import { Funnel_Sans } from "next/font/google";
import { UpdateLanguage } from "@/components/UpdateLanguage";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/env";
import { t } from "@/lib/i18n";
import { SITE_TITLE, SITE_DESCRIPTION, ogImageUrl, OG_IMAGE_SIZE } from "@/lib/metadata";

const inter = Funnel_Sans({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: SITE_TITLE,
	description: SITE_DESCRIPTION,
	alternates: {
		canonical: siteUrl,
		languages: {
			en: `${siteUrl}/en`,
			zh: `${siteUrl}/zh`,
			"x-default": `${siteUrl}/en`,
		},
	},
	openGraph: {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		url: siteUrl,
		siteName: t("siteName", "en"),
		locale: "en_US",
		type: "website",
		images: [
			{
				url: ogImageUrl(),
				width: OG_IMAGE_SIZE,
				height: OG_IMAGE_SIZE,
				alt: SITE_TITLE,
			},
		],
	},
	// twitter: {
	// 	card: "summary_large_image",
	// 	title: SITE_TITLE,
	// 	description: SITE_DESCRIPTION,
	// 	images: [ogImageUrl()],
	// },
};

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={inter.className} suppressHydrationWarning>
			<body className="relative min-w-screen min-h-screen flex flex-col justify-center overflow-hidden dark:bg-black">
				<UpdateLanguage />
				{children}
			</body>
		</html>
	);
}
