import { RootProvider } from "fumadocs-ui/provider/next";
import "../../../global.css";
import { Inter } from "next/font/google";
import { baseOptions, i18nUI } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import DefaultSearchDialog from "@/components/search";

const inter = Inter({
	subsets: ["latin"],
});

export default async function Layout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	const { nav, ...base } = baseOptions(lang);
	const { children: c, ...rest } = source.getPageTree(lang);
	const finalTree = {
		...rest,
		children: c.filter((child) => !child.$id?.endsWith("not-found.md")),
	};
	return (
		<html lang={lang} className={inter.className} suppressHydrationWarning>
			<body className="flex flex-col min-h-screen">
				<RootProvider
					i18n={i18nUI.provider(lang)}
					search={{
						SearchDialog: DefaultSearchDialog,
					}}
				>
					<DocsLayout
						{...base}
						tabMode="navbar"
						nav={{ ...nav, mode: "top" }}
						tree={finalTree}
					>
						{children}
					</DocsLayout>
				</RootProvider>
			</body>
		</html>
	);
}
