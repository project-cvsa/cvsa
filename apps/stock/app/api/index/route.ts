import { NextResponse } from "next/server";
import { getIndex } from "@/lib/stock-service";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const range = searchParams.get("range") ?? "week";
		const marketIndex = await getIndex(range);
		return NextResponse.json(marketIndex);
	} catch (error) {
		console.error("Failed to fetch index:", error);
		return NextResponse.json({ error: "Failed to fetch index" }, { status: 500 });
	}
}
