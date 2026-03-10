import { RootProvider } from "fumadocs-ui/provider/next";
import "../global.css";
import { Inter } from "next/font/google";
import { baseOptions, i18nUI } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";

const inter = Inter({
	subsets: ["latin"],
});

export default async function Layout({
	params,
	children,
}: {
	params: Promise<{ lang: string }>;
	children: React.ReactNode;
}) {
	const { lang } = await params;
	const { nav, ...base } = baseOptions(lang);
	return (
		<html lang={lang} className={inter.className} suppressHydrationWarning>
			<body className="flex flex-col min-h-screen">
				<RootProvider i18n={i18nUI.provider(lang)}>
					<DocsLayout
						{...base}
						tabMode="navbar"
						nav={{ ...nav, mode: "top" }}
						tree={source.getPageTree(lang)}
					>
						{children}
					</DocsLayout>
				</RootProvider>
			</body>
		</html>
	);
}
