import { NextResponse } from "next/server";
import { getTopStocks } from "@/lib/stock-service";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
	try {
		const stocks = await getTopStocks();
		return NextResponse.json({ stocks });
	} catch (error) {
		console.error("Failed to fetch stocks:", error);
		return NextResponse.json(
			{ error: "Failed to fetch stock data" },
			{ status: 500 },
		);
	}
}
