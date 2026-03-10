import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Inter } from "next/font/google";
import { i18nUI, baseOptions } from "@/lib/layout.shared";
import { headers } from "next/headers";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/page";

const inter = Inter({
	subsets: ["latin"],
});

export default async function NotFound() {
	const headersList = await headers();
	const rawLang = headersList.get("accept-language");
	const preferredLang = rawLang?.split(",")[0];
	const lang = preferredLang?.includes("zh") ? "zh" : "en";
	const { nav, ...base } = baseOptions(lang);
	const page = source.getPage(["not-found"], lang);
	const MDX = page?.data.body || (() => <></>);
	const { children, ...rest } = source.getPageTree(lang);
	const finalTree = {
		...rest,
		children: children.filter((child) => !child.$id?.endsWith("not-found.md")),
	};
	return (
		<html lang={lang} className={inter.className} suppressHydrationWarning>
			<body className="flex flex-col min-h-screen">
				<RootProvider i18n={i18nUI.provider(lang)}>
					<DocsLayout
						{...base}
						tabMode="navbar"
						nav={{ ...nav, mode: "top" }}
						tree={finalTree}
					>
						<DocsPage>
							<DocsTitle>{page?.data.title}</DocsTitle>
							<DocsBody>
								<MDX />
							</DocsBody>
						</DocsPage>
					</DocsLayout>
				</RootProvider>
			</body>
		</html>
	);
}
