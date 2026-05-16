import "./global.css";
import { Funnel_Sans } from "next/font/google";
import { UpdateLanguage } from "@/components/update-language";
import type { Metadata } from "next";

const inter = Funnel_Sans({
	subsets: ["latin"],
});

const baseUrl = "https://docs.projectcvsa.com";

export const metadata: Metadata = {
	title: "Project CVSA | Archive for a Better Future",
	description:
		"Project CVSA is an archive program aiming to collect and preserve all information about the Chinese singing voice synthesis community.",
	alternates: {
		canonical: baseUrl,
		languages: {
			en: `${baseUrl}/en`,
			zh: `${baseUrl}/zh`,
			"x-default": `${baseUrl}/en`,
		},
	},
	openGraph: {
		title: "Project CVSA | Archive for a Better Future",
		description:
			"Project CVSA is an archive program aiming to collect and preserve all information about the Chinese singing voice synthesis community.",
		url: baseUrl,
		siteName: "Project CVSA",
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Project CVSA | Archive for a Better Future",
		description:
			"Project CVSA is an archive program aiming to collect and preserve all information about the Chinese singing voice synthesis community.",
	},
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
