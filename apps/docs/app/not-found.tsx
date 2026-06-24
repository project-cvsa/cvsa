import "./global.css";
import { Inter } from "next/font/google";
import { UpdateLanguage } from "@/components/UpdateLanguage";
import type { Metadata } from "next";
import { SITE_TITLE_404, SITE_DESCRIPTION_404, ogImageUrl, OG_IMAGE_SIZE } from "@/lib/metadata";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: `${SITE_TITLE_404}`,
	description: SITE_DESCRIPTION_404,
	robots: { index: false, follow: false },
	openGraph: {
		title: `${SITE_TITLE_404}`,
		description: SITE_DESCRIPTION_404,
		images: [
			{
				url: ogImageUrl(),
				width: OG_IMAGE_SIZE,
				height: OG_IMAGE_SIZE,
				alt: SITE_TITLE_404,
			},
		],
	},
	// twitter: {
	// 	card: "summary_large_image",
	// 	title: `Not Found - ${SITE_TITLE_404}`,
	// 	description: SITE_DESCRIPTION_404,
	// 	images: [ogImageUrl()],
	// },
};

export default function NotFound() {
	return (
		<html lang="en" className={inter.className}>
			<body className="flex flex-col min-h-screen items-center justify-center gap-4">
				<UpdateLanguage />
				<h1 className="text-4xl font-bold">404</h1>
				<p className="text-fd-muted-foreground">Page not found</p>
				<a
					href="/en"
					className="text-fd-primary underline underline-offset-4 hover:text-fd-primary/80"
				>
					Go to homepage
				</a>
			</body>
		</html>
	);
}
