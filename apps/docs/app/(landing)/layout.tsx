import "./global.css";
import { Funnel_Sans } from "next/font/google";
import { UpdateLanguage } from "@/components/update-language";

const inter = Funnel_Sans({
	subsets: ["latin"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={inter.className} suppressHydrationWarning>
			<title>Project CVSA | Archive for a Better Future</title>
			<body className="relative min-w-screen min-h-screen flex flex-col justify-center overflow-hidden dark:bg-black">
				<UpdateLanguage />
				{children}
			</body>
		</html>
	);
}
