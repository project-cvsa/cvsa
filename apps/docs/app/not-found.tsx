import "./global.css";
import { Inter } from "next/font/google";
import { UpdateLanguage } from "@/components/update-language";

const inter = Inter({
	subsets: ["latin"],
});

export default function NotFound() {
	return (
		<html lang="en" className={inter.className}>
			<body className="flex flex-col min-h-screen">
				<UpdateLanguage />
				<h1>Not Found</h1>
			</body>
		</html>
	);
}
