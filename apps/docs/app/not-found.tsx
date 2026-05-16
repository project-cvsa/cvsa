import "./global.css";
import { Inter } from "next/font/google";
import { UpdateLanguage } from "@/components/update-language";
import type { Metadata } from "next";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Not Found - Project CVSA",
	description: "The page you are looking for does not exist.",
	robots: { index: false, follow: false },
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
