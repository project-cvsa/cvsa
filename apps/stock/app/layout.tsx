import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ColorModeProvider } from "@/components/ColorModeContext";

const interSans = Inter({
	variable: "--font-inter-sans",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "中V大盘",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`${interSans.variable} h-full antialiased dark`}
		>
			<body className="font-sans  bg-[#0a0a0a] text-white">
				<ColorModeProvider>{children}</ColorModeProvider>
			</body>
		</html>
	);
}
